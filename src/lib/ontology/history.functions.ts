/**
 * Object history + lineage queries for the digital twin UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Input = z.object({
  objectType: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  objectId: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/),
});

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const getObjectHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { events: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("audit_log")
      .select("id, action, diff, actor_id, created_at")
      .eq("organization_id", orgId)
      .eq("object_type", data.objectType)
      .eq("object_id", data.objectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

export const getObjectLineage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => Input.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { pipelines: [], runs: [] };
    const { data: pipelines } = await supabaseAdmin
      .from("pipelines")
      .select("id, name, source_table, target_object_type, enabled, schedule_cron")
      .eq("organization_id", orgId)
      .eq("target_object_type", data.objectType);
    const pipelineIds = (pipelines ?? []).map((p) => p.id);
    let runs: Array<{
      id: string;
      pipeline_id: string;
      status: string;
      rows_in: number;
      rows_out: number;
      started_at: string;
      finished_at: string | null;
    }> = [];
    if (pipelineIds.length) {
      const { data: runRows } = await supabaseAdmin
        .from("pipeline_runs")
        .select("id, pipeline_id, status, rows_in, rows_out, started_at, finished_at")
        .in("pipeline_id", pipelineIds)
        .order("started_at", { ascending: false })
        .limit(10);
      runs = runRows ?? [];
    }
    return { pipelines: pipelines ?? [], runs };
  });
