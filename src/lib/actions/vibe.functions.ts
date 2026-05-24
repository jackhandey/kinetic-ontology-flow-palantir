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

async function getOrgRole(userId: string): Promise<{ orgId: string; role: string } | null> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ? { orgId: data.organization_id, role: data.role } : null;
}

type ApprovalRule = {
  field: string;
  op: ">" | ">=" | "<" | "<=" | "==";
  value: number | string | boolean;
};

function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, p) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[p] : undefined),
    obj,
  );
}

function evalApproval(rule: ApprovalRule | null, payload: Record<string, unknown>): boolean {
  if (!rule) return false;
  const v = getField(payload, rule.field);
  switch (rule.op) {
    case ">": return typeof v === "number" && typeof rule.value === "number" && v > rule.value;
    case ">=": return typeof v === "number" && typeof rule.value === "number" && v >= rule.value;
    case "<": return typeof v === "number" && typeof rule.value === "number" && v < rule.value;
    case "<=": return typeof v === "number" && typeof rule.value === "number" && v <= rule.value;
    case "==": return v === rule.value;
  }
}

export const VibeInput = z.object({
  prompt: z.string().min(2).max(2000),
  contextObjectId: z.string().min(1).max(255).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  contextObjectType: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/).optional(),
});

export const dispatchVibe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => VibeInput.parse(i))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Lovable AI is not configured");
    const role = await getOrgRole(context.userId);
    if (!role) throw new Error("No organization");
    const orgId = role.orgId;

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

    // Ontology RAG: when a context object is provided, hydrate connected
    // objects + recent history so the LLM can reason over relationships.
    let connectedObjects: Array<{ id: string; type: string; link: string }> = [];
    let contextHistory: Array<{ action: string; created_at: string }> = [];
    if (data.contextObjectId && data.contextObjectType) {
      const { data: linkTypes } = await supabaseAdmin
        .from("ontology_link_types")
        .select("id, api_name, display_name")
        .eq("organization_id", orgId);
      const ltById = new Map((linkTypes ?? []).map((lt) => [lt.id, lt] as const));
      const { data: links } = await supabaseAdmin
        .from("ontology_object_links")
        .select("link_type_id, from_object_id, to_object_id")
        .eq("organization_id", orgId)
        .or(
          `from_object_id.eq.${data.contextObjectId},to_object_id.eq.${data.contextObjectId}`,
        )
        .limit(40);
      connectedObjects = (links ?? []).map((l) => {
        const lt = ltById.get(l.link_type_id);
        const isFrom = l.from_object_id === data.contextObjectId;
        return {
          id: isFrom ? l.to_object_id : l.from_object_id,
          type: lt?.api_name ?? "unknown",
          link: lt?.display_name ?? "linked",
        };
      });
      const { data: hist } = await supabaseAdmin
        .from("audit_log")
        .select("action, created_at")
        .eq("organization_id", orgId)
        .eq("object_type", data.contextObjectType)
        .eq("object_id", data.contextObjectId)
        .order("created_at", { ascending: false })
        .limit(10);
      contextHistory = hist ?? [];
    }

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
      "Use the recent alerts/tasks list to resolve references like 'the latest critical alert'.",
      "Use connectedObjects + contextHistory to reason about relationships and recent changes.",
      "If nothing matches, respond plainly without calling a tool.",
      `Context object: ${data.contextObjectType ?? "n/a"} / ${data.contextObjectId ?? "n/a"}`,
      `Recent alerts: ${JSON.stringify(recentAlerts ?? [])}`,
      `Recent tasks: ${JSON.stringify(recentTasks ?? [])}`,
      `Connected objects: ${JSON.stringify(connectedObjects)}`,
      `Context history: ${JSON.stringify(contextHistory)}`,
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

    // Visual reasoning: surface what the LLM "saw" + decided.
    const reasoning: string[] = [
      `Loaded ${actions.length} available actions for org`,
      `Sampled ${recentAlerts?.length ?? 0} recent alerts, ${recentTasks?.length ?? 0} tasks`,
    ];
    if (data.contextObjectId) {
      reasoning.push(
        `Hydrated ${connectedObjects.length} connected objects + ${contextHistory.length} history entries for ${data.contextObjectType}/${data.contextObjectId}`,
      );
    }
    const contextNodeIds: string[] = [
      ...(data.contextObjectId ? [data.contextObjectId] : []),
      ...connectedObjects.map((c) => c.id),
      ...(recentAlerts ?? []).slice(0, 5).map((a) => a.id as string),
    ];

    if (!toolCall) {
      reasoning.push("Model returned no tool call — nothing dispatched");
      return {
        ok: false as const,
        message: choice?.message?.content ?? "No matching action found.",
        reasoning,
        contextNodeIds,
      };
    }
    reasoning.push(`Model chose tool: ${toolCall.function?.name}`);

    const action = actions.find((a) => a.api_name === toolCall.function?.name);
    if (!action) {
      return { ok: false as const, message: `Unknown action ${toolCall.function?.name}`, reasoning, contextNodeIds };
    }
    let args: { target_object_id?: string; payload?: Record<string, unknown> } = {};
    try {
      args = JSON.parse(toolCall.function?.arguments ?? "{}");
    } catch {
      return { ok: false as const, message: "LLM returned unparseable arguments", reasoning, contextNodeIds };
    }
    if (!args.target_object_id) {
      return { ok: false as const, message: "LLM did not specify a target object", reasoning, contextNodeIds };
    }
    reasoning.push(`Target object: ${args.target_object_id}`);

    // Inline dispatch: insert action_request, then call the RPC or webhook.
    const payload = args.payload ?? {};

    // Fetch full action_type to evaluate approval rules + dispatch target.
    const { data: at } = await supabaseAdmin
      .from("action_types")
      .select("id, rpc_function, webhook_url, api_name, requires_approval_rule")
      .eq("id", action.id)
      .eq("organization_id", orgId)
      .single();
    if (!at) return { ok: false as const, message: "Action type not found" };

    const needsApproval = evalApproval(
      (at.requires_approval_rule as unknown as ApprovalRule | null) ?? null,
      payload,
    );
    if (needsApproval) {
      reasoning.push(`Approval rule matched — gating dispatch`);
    }

    // Approval-gated actions can only be self-approved by admins. Non-admins
    // get a pending_approval record so the standard approval flow takes over.
    if (needsApproval && role.role !== "admin") {
      const { data: pending, error: pendErr } = await supabaseAdmin
        .from("action_requests")
        .insert({
          action_type_id: at.id,
          organization_id: orgId,
          target_object_id: args.target_object_id,
          payload: payload as never,
          status: "pending_approval",
          requested_by: context.userId,
        })
        .select()
        .single();
      if (pendErr || !pending) throw new Error(pendErr?.message ?? "Insert failed");
      reasoning.push(`Created pending_approval request ${pending.id}`);
      return {
        ok: true as const,
        action: at.api_name,
        targetObjectId: args.target_object_id,
        payloadJson: JSON.stringify(payload),
        requestId: pending.id,
        status: "pending_approval" as const,
        reasoning,
        contextNodeIds,
      };
    }

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("action_requests")
      .insert({
        action_type_id: at.id,
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

    // Dispatch via RPC if configured, otherwise via webhook.
    if (at.rpc_function) {
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
    } else {
      const url = at.webhook_url ?? process.env.N8N_WEBHOOK_URL;
      if (!url) {
        await supabaseAdmin
          .from("action_requests")
          .update({ status: "failed", dispatch_response: { error: "no webhook configured" } })
          .eq("id", req.id);
        return { ok: false as const, message: "No dispatch target configured for this action" };
      }
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action_type: at.api_name,
            object_id: args.target_object_id,
            payload,
            requested_at: new Date().toISOString(),
          }),
        });
        const body = (await r.text().catch(() => "")).slice(0, 1000);
        const ok = r.status >= 200 && r.status < 300;
        await supabaseAdmin
          .from("action_requests")
          .update({
            status: ok ? "succeeded" : "failed",
            dispatched_at: new Date().toISOString(),
            dispatch_response: { status: r.status, body },
          })
          .eq("id", req.id);
        if (!ok) throw new Error(`Webhook returned ${r.status}`);
      } catch (err) {
        await supabaseAdmin
          .from("action_requests")
          .update({
            status: "failed",
            dispatched_at: new Date().toISOString(),
            dispatch_response: { error: err instanceof Error ? err.message : String(err) },
          })
          .eq("id", req.id);
        throw err;
      }
    }

    reasoning.push(`Dispatched via ${at.rpc_function ? `rpc:${at.rpc_function}` : "webhook"}`);
    return {
      ok: true as const,
      action: at.api_name,
      targetObjectId: args.target_object_id,
      payloadJson: JSON.stringify(payload),
      requestId: req.id,
      status: "dispatched" as const,
      reasoning,
      contextNodeIds,
    };

  });


