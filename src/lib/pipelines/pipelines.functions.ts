/**
 * Pipeline registry — tracks data transformations from raw_* staging tables
 * into ontology objects. Foundation for Foundry-style Pipeline Builder.
 *
 * `runPipeline` is a thin stub: it scans raw rows with processed_status=false,
 * records a pipeline_runs row, and marks them processed. Real transform logic
 * lives in mappers.server.ts and will be wired per source_table over time.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ALLOWED_SOURCE_TABLES = new Set([
  "raw_telemetry_logs",
  "raw_asset_status",
  "raw_freight_orders",
  "raw_route_plans",
  "raw_inventory_batches",
  "raw_shipping_manifests",
  "raw_weather_conditions",
  "raw_traffic_incidents",
  "raw_driver_logs",
  "raw_fleet_status",
  "raw_tickets",
  "raw_transactions",
]);

async function getOrgId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

async function getOrgIdAndRole(
  userId: string,
): Promise<{ orgId: string; role: string } | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { orgId: data.organization_id, role: data.role };
}

function requireAdmin(orgData: { orgId: string; role: string } | null): { orgId: string } {
  if (!orgData) throw new Error("No organization");
  if (orgData.role !== "admin") throw new Error("Admin role required");
  return { orgId: orgData.orgId };
}

export const listPipelines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { pipelines: [] };
    const { data, error } = await supabaseAdmin
      .from("pipelines")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pipelines: data ?? [] };
  });

export const ListRunsInput = z.object({ pipelineId: z.string().uuid() });
export const listPipelineRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListRunsInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { runs: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("pipeline_runs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("pipeline_id", data.pipelineId)
      .order("started_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

export const CreatePipelineInput = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  sourceTable: z.string().min(1).max(64).refine((s) => ALLOWED_SOURCE_TABLES.has(s), {
    message: "Unknown source_table",
  }),
  targetObjectType: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  transformSql: z.string().max(10_000).optional(),
  scheduleCron: z.string().max(128).optional(),
});

export const createPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreatePipelineInput.parse(i))
  .handler(async ({ data, context }) => {
    const { orgId } = requireAdmin(await getOrgIdAndRole(context.userId));
    const { data: row, error } = await supabaseAdmin
      .from("pipelines")
      .insert({
        organization_id: orgId,
        name: data.name,
        description: data.description ?? null,
        source_table: data.sourceTable,
        target_object_type: data.targetObjectType,
        transform_sql: data.transformSql ?? null,
        schedule_cron: data.scheduleCron ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { pipeline: row };
  });

export const RunPipelineInput = z.object({ pipelineId: z.string().uuid() });
export const runPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RunPipelineInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) throw new Error("No organization");

    const { data: pipeline, error: pErr } = await supabaseAdmin
      .from("pipelines")
      .select("*")
      .eq("id", data.pipelineId)
      .eq("organization_id", orgId)
      .single();
    if (pErr || !pipeline) throw new Error("Pipeline not found");
    if (!ALLOWED_SOURCE_TABLES.has(pipeline.source_table)) {
      throw new Error("Pipeline source_table not allowlisted");
    }

    const { data: runRow, error: rErr } = await supabaseAdmin
      .from("pipeline_runs")
      .insert({
        pipeline_id: pipeline.id,
        organization_id: orgId,
        status: "running",
        triggered_by: context.userId,
      })
      .select()
      .single();
    if (rErr || !runRow) throw new Error(rErr?.message ?? "Could not start run");

    const started = Date.now();
    try {
      const { data: unprocessed, error: scanErr } = await supabaseAdmin
        .from(pipeline.source_table as never)
        .select("id")
        .eq("organization_id", orgId)
        .eq("processed_status", false)
        .limit(1000);
      if (scanErr) throw new Error(scanErr.message);

      const ids = (unprocessed ?? []).map((r: { id: string }) => r.id);
      if (ids.length) {
        await supabaseAdmin
          .from(pipeline.source_table as never)
          .update({ processed_status: true, processed_at: new Date().toISOString() } as never)
          .in("id", ids);
      }

      await supabaseAdmin
        .from("pipeline_runs")
        .update({
          status: "succeeded",
          rows_in: ids.length,
          rows_out: ids.length,
          finished_at: new Date().toISOString(),
          log: { duration_ms: Date.now() - started, note: "stub transform" },
        })
        .eq("id", runRow.id);

      return { runId: runRow.id, rowsProcessed: ids.length, status: "succeeded" as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("pipeline_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: message,
        })
        .eq("id", runRow.id);
      throw err;
    }
  });
