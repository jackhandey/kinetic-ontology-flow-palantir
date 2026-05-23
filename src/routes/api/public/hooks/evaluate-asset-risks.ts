/**
 * Hourly background worker — evaluates new ActiveAssets for logistical risk
 * via the Lovable AI Gateway and persists flagged risks to `ontology_alerts`.
 *
 * Invoked by pg_cron + pg_net (see migrations / scheduling SQL). Lives under
 * /api/public/* so auth is bypassed at the edge; we authenticate with the
 * Supabase publishable key in the `apikey` header at the cron scheduler.
 *
 * The route uses `supabaseAdmin` (service role) because it operates across
 * organizations on behalf of the system, not a logged-in user.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mapAssetStatusRow, type RawRow } from "@/lib/ontology/mappers.server";
import type { ActiveAsset } from "@/lib/ontology/schemas";
import { evaluateAssetRisk, type RiskContext } from "@/lib/ontology/risk-evaluator.server";

// How far back to look for "new" assets each run. With hourly cron we look
// back 75 minutes to absorb scheduling jitter without re-evaluating last
// hour's already-alerted assets (the dedupe below covers the overlap).
const LOOKBACK_MINUTES = 75;
const MAX_ASSETS_PER_RUN = 50;
const CONTEXT_LIMIT = 50;

export const Route = createFileRoute("/api/public/hooks/evaluate-asset-risks")({
  server: {
    handlers: {
      POST: async () => {
        const since = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
        const summary = {
          assetsConsidered: 0,
          assetsEvaluated: 0,
          alertsCreated: 0,
          skippedDuplicates: 0,
          errors: [] as Array<{ assetId: string; code?: string; message?: string }>,
        };

        // 1. Fetch recently-ingested raw asset_status rows across all orgs.
        const { data: assetRows, error: assetErr } = await supabaseAdmin
          .from("raw_asset_status")
          .select("id, organization_id, raw_payload, ingested_at, processed_at")
          .gte("ingested_at", since)
          .order("ingested_at", { ascending: false })
          .limit(MAX_ASSETS_PER_RUN);

        if (assetErr) {
          return json({ error: assetErr.message }, 500);
        }
        summary.assetsConsidered = assetRows?.length ?? 0;

        // Map rows -> ActiveAsset, skip mapper failures.
        const assets: ActiveAsset[] = (assetRows as RawRow[] | null ?? [])
          .map(mapAssetStatusRow)
          .filter((x): x is ActiveAsset => x !== null);

        for (const asset of assets) {
          // 2. Skip if we already have a recent alert for this asset (dedupe overlap window).
          const { data: existing, error: existErr } = await supabaseAdmin
            .from("ontology_alerts")
            .select("id")
            .eq("organization_id", asset.organizationId)
            .eq("source_asset_id", asset.id)
            .gte("detected_at", since)
            .limit(1);
          if (existErr) {
            summary.errors.push({ assetId: asset.id, code: "dedupe_query", message: existErr.message });
            continue;
          }
          if (existing && existing.length > 0) {
            summary.skippedDuplicates += 1;
            continue;
          }

          // 3. Gather recent context for the asset's org (parallel).
          const ctxSince = new Date(Date.now() - 6 * 60 * 60_000).toISOString();
          const [weather, traffic, drivers, telemetry] = await Promise.all([
            supabaseAdmin
              .from("raw_weather_conditions")
              .select("raw_payload")
              .eq("organization_id", asset.organizationId)
              .gte("ingested_at", ctxSince)
              .limit(CONTEXT_LIMIT),
            supabaseAdmin
              .from("raw_traffic_incidents")
              .select("raw_payload")
              .eq("organization_id", asset.organizationId)
              .gte("ingested_at", ctxSince)
              .limit(CONTEXT_LIMIT),
            supabaseAdmin
              .from("raw_driver_logs")
              .select("raw_payload")
              .eq("organization_id", asset.organizationId)
              .gte("ingested_at", ctxSince)
              .limit(CONTEXT_LIMIT),
            supabaseAdmin
              .from("raw_telemetry_logs")
              .select("raw_payload")
              .eq("organization_id", asset.organizationId)
              .gte("ingested_at", ctxSince)
              .limit(CONTEXT_LIMIT),
          ]);

          const context: RiskContext = {
            recentWeather: (weather.data ?? []).map((r) => r.raw_payload),
            recentTraffic: (traffic.data ?? []).map((r) => r.raw_payload),
            recentDriverLogs: (drivers.data ?? []).map((r) => r.raw_payload),
            recentTelemetry: (telemetry.data ?? []).map((r) => r.raw_payload),
          };

          // 4. Ask the LLM.
          const result = await evaluateAssetRisk(asset, context);
          summary.assetsEvaluated += 1;

          if (result.errorCode === "rate_limited" || result.errorCode === "payment_required") {
            // Stop the batch — every subsequent call will fail the same way.
            summary.errors.push({
              assetId: asset.id,
              code: result.errorCode,
              message: result.errorMessage,
            });
            return json(
              { stopped: true, reason: result.errorCode, summary },
              result.errorCode === "rate_limited" ? 429 : 402,
            );
          }
          if (!result.evaluation) {
            summary.errors.push({
              assetId: asset.id,
              code: result.errorCode ?? "no_evaluation",
              message: result.errorMessage,
            });
            continue;
          }
          if (!result.evaluation.riskDetected) {
            continue;
          }

          // 5. Persist as an ontology_alerts row.
          const ev = result.evaluation;
          const { error: insertErr } = await supabaseAdmin.from("ontology_alerts").insert({
            organization_id: asset.organizationId,
            source_asset_id: asset.id,
            severity: ev.severity,
            category: ev.category,
            headline: ev.headline,
            description: ev.description,
            impacted_asset_ids: ev.impactedAssetIds,
            impacted_route_ids: ev.impactedRouteIds,
            exposure_usd: ev.exposureUsd,
            evaluation_model: result.model,
            evaluation_payload: JSON.parse(JSON.stringify(ev)),
            detected_at: new Date().toISOString(),
          });
          if (insertErr) {
            summary.errors.push({ assetId: asset.id, code: "insert_alert", message: insertErr.message });
            continue;
          }
          summary.alertsCreated += 1;
        }

        return json({ ok: true, summary });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
