/**
 * Vibe command bar — turn a natural-language request into a structured
 * action call using Lovable AI tool-calling, then dispatch via the
 * existing action framework.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Inline dispatch to avoid server-fn-to-server-fn auth loss.

async function getOrgId(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const VibeInput = z.object({
  prompt: z.string().min(2).max(2000),
  contextObjectId: z.string().min(1).max(255).optional(),
  contextObjectType: z.string().min(1).max(64).optional(),
});

export const dispatchVibe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VibeInput.parse(i))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Lovable AI is not configured");
    const orgId = await getOrgId(context.userId);
    if (!orgId) throw new Error("No organization");

    const { data: actions, error } = await supabaseAdmin
      .from("action_types")
      .select("id, api_name, display_name, description, target_object_type, payload_schema")
      .eq("organization_id", orgId)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    if (!actions || actions.length === 0) {
      throw new Error("No actions are configured for this organization");
    }

    // Optional: recent alerts as additional context for the LLM.
    const { data: recentAlerts } = await supabaseAdmin
      .from("ontology_alerts")
      .select("id, headline, severity, category, source_asset_id, resolved_at")
      .eq("organization_id", orgId)
      .order("detected_at", { ascending: false })
      .limit(20);

    const { data: recentTasks } = await supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);


    const tools = actions.map((a) => ({
      type: "function" as const,
      function: {
        name: a.api_name,
        description: `${a.display_name}${a.description ? " — " + a.description : ""} (target type: ${a.target_object_type})`,
        parameters: {
          type: "object",
          properties: {
            target_object_id: { type: "string", description: "ID of the object to act on" },
            payload: (a.payload_schema as Record<string, unknown>) ?? { type: "object" },
          },
          required: ["target_object_id"],
          additionalProperties: false,
        },
      },
    }));

    const systemPrompt = [
      "You are an operations copilot for a Palantir-style ontology platform.",
      "Translate the user's request into ONE tool call from the available actions.",
      "Use the recent alerts list to resolve references like 'the latest critical alert'.",
      "If nothing matches, respond plainly without calling a tool.",
      `Context object: ${data.contextObjectType ?? "n/a"} / ${data.contextObjectId ?? "n/a"}`,
      `Recent alerts: ${JSON.stringify(recentAlerts ?? [])}`,
      `Recent tasks: ${JSON.stringify(recentTasks ?? [])}`,
    ].join("\n");


    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.prompt },
        ],
        tools,
        tool_choice: "auto",
      }),
    });

    if (res.status === 429) throw new Error("Rate limit exceeded, please try again later.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add funds in workspace settings.");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AI gateway error ${res.status}: ${t.slice(0, 200)}`);
    }
    const body = await res.json();
    const choice = body?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];

    if (!toolCall) {
      return {
        ok: false as const,
        message: choice?.message?.content ?? "No matching action found.",
      };
    }

    const action = actions.find((a) => a.api_name === toolCall.function?.name);
    if (!action) {
      return { ok: false as const, message: `Unknown action ${toolCall.function?.name}` };
    }
    let args: { target_object_id?: string; payload?: Record<string, unknown> } = {};
    try {
      args = JSON.parse(toolCall.function?.arguments ?? "{}");
    } catch {
      return { ok: false as const, message: "LLM returned unparseable arguments" };
    }
    if (!args.target_object_id) {
      return { ok: false as const, message: "LLM did not specify a target object" };
    }

    // Inline dispatch: insert action_request, then call the RPC or webhook.
    const payload = args.payload ?? {};
    const { data: req, error: reqErr } = await supabaseAdmin
      .from("action_requests")
      .insert({
        action_type_id: action.id,
        organization_id: orgId,
        target_object_id: args.target_object_id,
        payload: payload as never,
        status: "approved",
        requested_by: context.userId,
        approved_at: new Date().toISOString(),
        approver_id: context.userId,
      })
      .select()
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Insert failed");

    // Best-effort dispatch via RPC (mirrors action-framework's tryDispatch).
    const { data: at } = await supabaseAdmin
      .from("action_types")
      .select("rpc_function, webhook_url, api_name")
      .eq("id", action.id)
      .single();

    if (at?.rpc_function) {
      const rpcArgs: Record<string, unknown> = {
        _alert_id: args.target_object_id,
        ...Object.fromEntries(
          Object.entries(payload).map(([k, v]) => [k.startsWith("_") ? k : `_${k}`, v]),
        ),
      };
      const { error: rpcErr } = await supabaseAdmin.rpc(
        at.rpc_function as never,
        rpcArgs as never,
      );
      await supabaseAdmin
        .from("action_requests")
        .update({
          status: rpcErr ? "failed" : "succeeded",
          dispatched_at: new Date().toISOString(),
          dispatch_response: rpcErr ? { error: rpcErr.message } : { rpc: at.rpc_function },
        })
        .eq("id", req.id);
      if (rpcErr) throw new Error(rpcErr.message);
    }

    return {
      ok: true as const,
      action: action.api_name,
      targetObjectId: args.target_object_id,
      payloadJson: JSON.stringify(payload),
      requestId: req.id,
      status: "dispatched" as const,
    };
  });


