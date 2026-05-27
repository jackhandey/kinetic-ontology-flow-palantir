/**
 * Server-only target-object resolver.
 *
 * Before dispatching an action we MUST fetch the authoritative target from
 * the ontology and re-verify org ownership. The returned snapshot is fed
 * into domain validation rules and forwarded to n8n so the automation runs
 * against a consistent server-side view of the world (not whatever the
 * client claimed).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ResolvedTarget = {
  type: string;
  id: string;
  /** Lightweight status used by domain rules (alert resolved/open, task complete/open, ...). */
  status: string | null;
  /** Full normalized snapshot — handed to n8n verbatim. */
  snapshot: Record<string, unknown>;
};

export class TargetNotFoundError extends Error {
  constructor(type: string, id: string) {
    super(`Target ${type}:${id} not found`);
    this.name = "TargetNotFoundError";
  }
}
export class TargetNotInOrgError extends Error {
  constructor(type: string, id: string) {
    super(`Target ${type}:${id} does not belong to caller's organization`);
    this.name = "TargetNotInOrgError";
  }
}

export async function resolveTarget(
  orgId: string,
  objectType: string,
  objectId: string,
): Promise<ResolvedTarget> {
  switch (objectType) {
    case "ontology_alert": {
      const { data, error } = await supabaseAdmin
        .from("ontology_alerts")
        .select("*")
        .eq("id", objectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new TargetNotFoundError(objectType, objectId);
      if (data.organization_id !== orgId) throw new TargetNotInOrgError(objectType, objectId);
      return {
        type: objectType,
        id: String(data.id),
        status: data.resolved_at ? "resolved" : "open",
        snapshot: data as Record<string, unknown>,
      };
    }

    case "task": {
      const { data, error } = await supabaseAdmin
        .from("tasks")
        .select("*")
        .eq("id", objectId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new TargetNotFoundError(objectType, objectId);
      if (data.organization_id !== orgId) throw new TargetNotInOrgError(objectType, objectId);
      return {
        type: objectType,
        id: String(data.id),
        status: String(data.status),
        snapshot: data as Record<string, unknown>,
      };
    }

    case "active_asset": {
      // Active assets are derived from raw_* streams. We look up the most
      // recent row for the given tracking id in either telemetry source.
      const [statusRes, fleetRes] = await Promise.all([
        supabaseAdmin
          .from("raw_asset_status")
          .select("id, organization_id, raw_payload, ingested_at")
          .eq("organization_id", orgId)
          .filter("raw_payload->>tracking_id", "eq", objectId)
          .order("ingested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("raw_fleet_status")
          .select("id, organization_id, raw_payload, ingested_at")
          .eq("organization_id", orgId)
          .filter("raw_payload->>tracking_id", "eq", objectId)
          .order("ingested_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const row = statusRes.data ?? fleetRes.data;
      if (!row) throw new TargetNotFoundError(objectType, objectId);
      const payload = (row.raw_payload ?? {}) as Record<string, unknown>;
      return {
        type: objectType,
        id: objectId,
        status: typeof payload.status === "string" ? (payload.status as string) : null,
        snapshot: { ...payload, _row_id: row.id, _ingested_at: row.ingested_at },
      };
    }

    default:
      // Unknown types are allowed through with a minimal snapshot so the
      // framework remains extensible, but they cannot fail domain rules.
      return { type: objectType, id: objectId, status: null, snapshot: { id: objectId } };
  }
}
