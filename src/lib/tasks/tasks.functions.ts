import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getOrgId(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { tasks: [] };
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { tasks: data ?? [] };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) throw new Error("No organization");
    const { data: row, error } = await supabaseAdmin
      .from("tasks")
      .insert({
        organization_id: orgId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { task: row };
  });
