/**
 * Object graph traversal — walks ontology_object_links up to a small depth
 * and returns a node/edge view for the Object Explorer UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GraphInput = z.object({
  objectType: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
  objectId: z.string().min(1).max(255),
  depth: z.number().int().min(1).max(2).default(1),
});

export type GraphNode = { id: string; type: string; title: string };
export type GraphEdge = { from: string; to: string; linkType: string; linkDisplay: string };

export const getObjectGraph = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => GraphInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    const orgId = roleRow?.organization_id;
    if (!orgId) {
      return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    }

    const { data: linkTypes } = await supabaseAdmin
      .from("ontology_link_types")
      .select("id, api_name, display_name, from_object_type_id, to_object_type_id")
      .eq("organization_id", orgId);
    const linkTypeById = new Map(
      (linkTypes ?? []).map((lt) => [lt.id, lt] as const),
    );

    const { data: objectTypes } = await supabaseAdmin
      .from("ontology_object_types")
      .select("id, api_name")
      .eq("organization_id", orgId);
    const typeApiById = new Map(
      (objectTypes ?? []).map((ot) => [ot.id, ot.api_name] as const),
    );

    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    nodes.set(data.objectId, { id: data.objectId, type: data.objectType, title: data.objectId });

    const frontier = new Set<string>([data.objectId]);
    for (let d = 0; d < data.depth; d++) {
      if (!frontier.size) break;
      const ids = [...frontier];
      frontier.clear();
      const { data: links } = await supabaseAdmin
        .from("ontology_object_links")
        .select("link_type_id, from_object_id, to_object_id")
        .eq("organization_id", orgId)
        .or(
          ids.map((id) => `from_object_id.eq.${id},to_object_id.eq.${id}`).join(","),
        )
        .limit(500);
      for (const l of links ?? []) {
        const lt = linkTypeById.get(l.link_type_id);
        if (!lt) continue;
        if (!nodes.has(l.from_object_id)) {
          const t = typeApiById.get(lt.from_object_type_id) ?? "unknown";
          nodes.set(l.from_object_id, { id: l.from_object_id, type: t, title: l.from_object_id });
          frontier.add(l.from_object_id);
        }
        if (!nodes.has(l.to_object_id)) {
          const t = typeApiById.get(lt.to_object_type_id) ?? "unknown";
          nodes.set(l.to_object_id, { id: l.to_object_id, type: t, title: l.to_object_id });
          frontier.add(l.to_object_id);
        }
        edges.push({
          from: l.from_object_id,
          to: l.to_object_id,
          linkType: lt.api_name,
          linkDisplay: lt.display_name,
        });
      }
    }

    return { nodes: [...nodes.values()], edges };
  });
