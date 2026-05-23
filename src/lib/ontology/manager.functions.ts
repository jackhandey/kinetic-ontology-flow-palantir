/**
 * Ontology Manager — read-only metadata queries.
 *
 * The ontology is now data (rows in ontology_object_types/properties/links),
 * not just hardcoded TS interfaces. These server fns let the UI introspect it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureOrgBootstrap } from "./bootstrap.server";

async function resolveOrgId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const listObjectTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgId(context.userId);
    if (!orgId) return { objectTypes: [] };
    await ensureOrgBootstrap(orgId);
    const { data, error } = await supabaseAdmin
      .from("ontology_object_types")
      .select("id, api_name, display_name, description, icon, title_field, primary_key_field")
      .eq("organization_id", orgId)
      .order("display_name");
    if (error) throw new Error(error.message);
    return { objectTypes: data ?? [] };
  });

export const listLinkTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrgId(context.userId);
    if (!orgId) return { linkTypes: [] };
    await ensureOrgBootstrap(orgId);
    const { data, error } = await supabaseAdmin
      .from("ontology_link_types")
      .select("id, api_name, display_name, cardinality, from_object_type_id, to_object_type_id")
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { linkTypes: data ?? [] };
  });

export const GetObjectLinksInput = z.object({
  objectId: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/),
});

export const getObjectLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GetObjectLinksInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await resolveOrgId(context.userId);
    if (!orgId) return { links: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("ontology_object_links")
      .select("id, link_type_id, from_object_id, to_object_id, created_at")
      .eq("organization_id", orgId)
      .or(`from_object_id.eq.${data.objectId},to_object_id.eq.${data.objectId}`)
      .limit(200);
    if (error) throw new Error(error.message);
    return { links: rows ?? [] };
  });
