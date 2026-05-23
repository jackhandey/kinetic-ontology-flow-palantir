/**
 * AIP Logic — registry of AI orchestrations + invocation log.
 *
 * Generic wrapper around Lovable AI Gateway. Each AIP function has a
 * stored model, system prompt, and JSON-schema for tool-calling structured
 * output. Every invocation is persisted to aip_function_invocations.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureOrgBootstrap } from "@/lib/ontology/bootstrap.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function getOrgId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const listAipFunctions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { functions: [] };
    await ensureOrgBootstrap(orgId);
    const { data, error } = await supabaseAdmin
      .from("aip_functions")
      .select("id, api_name, display_name, description, model, enabled, created_at")
      .eq("organization_id", orgId)
      .order("display_name");
    if (error) throw new Error(error.message);
    return { functions: data ?? [] };
  });

export const ListInvocationsInput = z.object({
  aipFunctionId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listAipInvocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ListInvocationsInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) return { invocations: [] };
    const { data: rows, error } = await supabaseAdmin
      .from("aip_function_invocations")
      .select("id, status, model, tokens_in, tokens_out, latency_ms, invoked_at, error")
      .eq("organization_id", orgId)
      .eq("aip_function_id", data.aipFunctionId)
      .order("invoked_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { invocations: rows ?? [] };
  });

export const InvokeInput = z.object({
  aipFunctionId: z.string().uuid(),
  input: z.record(z.string(), z.unknown()),
});

export const invokeAipFunction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InvokeInput.parse(i))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.userId);
    if (!orgId) throw new Error("No organization");

    const { data: fn, error: fnErr } = await supabaseAdmin
      .from("aip_functions")
      .select("*")
      .eq("id", data.aipFunctionId)
      .eq("organization_id", orgId)
      .single();
    if (fnErr || !fn) throw new Error("AIP function not found");
    if (!fn.enabled) throw new Error("AIP function is disabled");

    const { data: invocation, error: invErr } = await supabaseAdmin
      .from("aip_function_invocations")
      .insert({
        aip_function_id: fn.id,
        organization_id: orgId,
        input: data.input as never,
        invoked_by: context.userId,
        model: fn.model,
      })
      .select()
      .single();
    if (invErr || !invocation) throw new Error(invErr?.message ?? "Invocation insert failed");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      await supabaseAdmin
        .from("aip_function_invocations")
        .update({ status: "failed", error: "LOVABLE_API_KEY missing" })
        .eq("id", invocation.id);
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const started = Date.now();
    try {
      const resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: fn.model,
          messages: [
            { role: "system", content: fn.system_prompt },
            { role: "user", content: JSON.stringify(data.input) },
          ],
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Gateway ${resp.status}: ${text.slice(0, 300)}`);
      }
      const body = await resp.json();
      const text =
        (body as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message
          ?.content ?? "";
      const usage = (body as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;

      await supabaseAdmin
        .from("aip_function_invocations")
        .update({
          status: "succeeded",
          output: { content: text },
          tokens_in: usage?.prompt_tokens ?? null,
          tokens_out: usage?.completion_tokens ?? null,
          latency_ms: Date.now() - started,
        })
        .eq("id", invocation.id);

      return { invocationId: invocation.id, output: text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin
        .from("aip_function_invocations")
        .update({
          status: "failed",
          error: message,
          latency_ms: Date.now() - started,
        })
        .eq("id", invocation.id);
      throw err;
    }
  });
