/**
 * Ontology-authoritative action dispatch.
 *
 * Pipeline (Palantir-style):
 *   1. requireSupabaseAuth — verify identity
 *   2. resolve caller org (user_roles)
 *   3. resolveTarget()    — fetch authoritative object from ontology
 *   4. domain validation  — "can this object accept this action?"
 *   5. audit_log insert   — durable record of intent
 *   6. webhook → n8n      — forwards normalized {target, payload}
 *   7. audit_log insert   — durable record of outcome
 *
 * n8n writes state back via existing Supabase RPCs (resolve_ontology_alert,
 * mark_task_complete, ...). This function never mutates ontology rows itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  resolveTarget,
  TargetNotFoundError,
  TargetNotInOrgError,
  type ResolvedTarget,
} from "@/lib/actions/target-resolver.server";

export const DispatchActionInputSchema = z.object({
  objectId: z.string().min(1).max(255),
  actionType: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_\-.]+$/i, "actionType must be alphanumeric/underscore"),
  objectKind: z.enum(["ontology_alert", "active_asset", "task"]),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type DispatchActionInput = z.infer<typeof DispatchActionInputSchema>;

/**
 * Domain rules — keyed by action api_name. Each rule receives the resolved
 * target and returns an error string if the action is not allowed.
 *
 * Keep these small and explicit. Anything more elaborate should live in
 * `action_types.validation_rules` with `scope: "target"`.
 */
const DOMAIN_RULES: Record<string, (t: ResolvedTarget) => string | null> = {
  "resolve_ontology_alert": (t) =>
    t.type === "ontology_alert" && t.status === "resolved"
      ? "Alert is already resolved"
      : null,
  "mark_task_complete": (t) =>
    t.type === "task" && t.status === "complete" ? "Task is already complete" : null,
};

async function writeAudit(
  orgId: string,
  actorId: string,
  objectId: string,
  action: string,
  diff: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_log").insert({
    organization_id: orgId,
    object_type: "action_request",
    object_id: objectId,
    actor_id: actorId,
    action,
    diff: diff as never,
  });
}

export const dispatchAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DispatchActionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) throw new Error("N8N_WEBHOOK_URL is not configured");

    // 2 — caller org
    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("organization_id")
      .eq("user_id", context.userId)
      .limit(1)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow) throw new Error("No organization membership for caller");
    const orgId = roleRow.organization_id;

    // 3 — authoritative target
    let target: ResolvedTarget;
    try {
      target = await resolveTarget(orgId, data.objectKind, data.objectId);
    } catch (err) {
      if (err instanceof TargetNotFoundError || err instanceof TargetNotInOrgError) {
        await writeAudit(orgId, context.userId, data.objectId, "rejected", {
          reason: err.message,
          action_type: data.actionType,
        });
        throw err;
      }
      throw err;
    }

    // 4 — domain validation
    const ruleErr = DOMAIN_RULES[data.actionType]?.(target) ?? null;
    if (ruleErr) {
      await writeAudit(orgId, context.userId, data.objectId, "rejected", {
        reason: ruleErr,
        action_type: data.actionType,
        target: { type: target.type, id: target.id, status: target.status },
      });
      throw new Error(`Domain rule failed: ${ruleErr}`);
    }

    const dispatchedAt = new Date().toISOString();
    const body = {
      action_type: data.actionType,
      object_id: data.objectId,
      object_kind: data.objectKind,
      organization_id: orgId,
      dispatched_by: context.userId,
      dispatched_at: dispatchedAt,
      target: { type: target.type, id: target.id, status: target.status, snapshot: target.snapshot },
      context: data.context ?? {},
    };

    // 5 — audit intent
    await writeAudit(orgId, context.userId, data.objectId, "requested", {
      action_type: data.actionType,
      target: { type: target.type, id: target.id, status: target.status },
    });

    // 6 — webhook
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text().catch(() => "");
      await writeAudit(orgId, context.userId, data.objectId, "failed", {
        action_type: data.actionType,
        status: upstream.status,
        response: errBody.slice(0, 500),
      });
      throw new Error(
        `Webhook returned ${upstream.status} ${upstream.statusText}${errBody ? `: ${errBody.slice(0, 200)}` : ""}`,
      );
    }

    // 7 — audit outcome
    await writeAudit(orgId, context.userId, data.objectId, "dispatched", {
      action_type: data.actionType,
      status: upstream.status,
    });

    return { status: upstream.status, dispatchedAt };
  });
