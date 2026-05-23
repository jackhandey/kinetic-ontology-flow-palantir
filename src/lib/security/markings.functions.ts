/**
 * Markings — read/manage classification markings and per-user grants.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureOrgBootstrap } from "@/lib/ontology/bootstrap.server";

async function getOrgRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ? { orgId: data.organization_id, role: data.role } : null;
}

export const listMarkings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await getOrgRole(context.userId);
    if (!r) return { markings: [] };
    await ensureOrgBootstrap(r.orgId);
    const { data, error } = await supabaseAdmin
      .from("classification_markings")
      .select("id, code, description, color")
      .eq("organization_id", r.orgId)
      .order("code");
    if (error) throw new Error(error.message);
    return { markings: data ?? [] };
  });

export const getMyMarkings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await getOrgRole(context.userId);
    if (!r) return { grants: [] };
    const { data, error } = await supabaseAdmin
      .from("user_marking_grants")
      .select("marking_id, classification_markings!inner(code)")
      .eq("user_id", context.userId)
      .eq("organization_id", r.orgId);
    if (error) throw new Error(error.message);
    const grants = (data ?? []).map((row) => ({
      markingId: row.marking_id,
      markingCode: (row.classification_markings as unknown as { code: string }).code,
    }));
    return { grants };
  });

export const GrantMarkingInput = z.object({
  userId: z.string().uuid(),
  markingId: z.string().uuid(),
});

export const grantMarking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GrantMarkingInput.parse(i))
  .handler(async ({ data, context }) => {
    const r = await getOrgRole(context.userId);
    if (!r || r.role !== "admin") throw new Error("Admin role required");
    const { error } = await supabaseAdmin
      .from("user_marking_grants")
      .upsert(
        {
          user_id: data.userId,
          organization_id: r.orgId,
          marking_id: data.markingId,
          granted_by: context.userId,
        },
        { onConflict: "user_id,marking_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
