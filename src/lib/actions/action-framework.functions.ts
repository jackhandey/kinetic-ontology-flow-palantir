/**
 * Action Framework — validation + approval-gated dispatch.
 *
 * Wraps the existing webhook dispatcher with:
 *  - declarative validation rules against the payload
 *  - approval thresholds (e.g. exposure > $10k requires admin sign-off)
 *  - a full audit trail in action_requests
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureOrgBootstrap } from "@/lib/ontology/bootstrap.server";

type ValidationRule = {
  field: string;
  op: "required" | "min" | "max" | "regex";
  value?: unknown;
};
type ApprovalRule = {
  field: string;
  op: ">" | ">=" | "<" | "<=" | "==";
  value: number | string | boolean;
};

async function getOrgIdAndRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ? { orgId: data.organization_id, role: data.role } : null;
}

function getField(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (acc, p) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[p] : undefined),
    obj,
  );
}

function evalValidation(rules: ValidationRule[], payload: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const r of rules) {
    const v = getField(payload, r.field);
    if (r.op === "required" && (v === undefined || v === null || v === "")) {
      errors.push(`${r.field} is required`);
    } else if (r.op === "min" && typeof v === "number" && typeof r.value === "number" && v < r.value) {
      errors.push(`${r.field} must be >= ${r.value}`);
    } else if (r.op === "max" && typeof v === "number" && typeof r.value === "number" && v > r.value) {
      errors.push(`${r.field} must be <= ${r.value}`);
    } else if (r.op === "regex" && typeof v === "string" && typeof r.value === "string") {
      if (!new RegExp(r.value).test(v)) errors.push(`${r.field} format invalid`);
    }
  }
  return errors;
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

async function dispatchWebhook(
  url: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.text().catch(() => "")).slice(0, 1000) };
}

// -- Listing --------------------------------------------------------------
export const listActionTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getOrgIdAndRole(context.userId);
    if (!role) return { actionTypes: [] };
    await ensureOrgBootstrap(role.orgId);
    const { data, error } = await supabaseAdmin
      .from("action_types")
      .select("*")
      .eq("organization_id", role.orgId)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    return { actionTypes: data ?? [] };
  });

export const listActionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(200).default(50) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getOrgIdAndRole(context.userId);
    if (!role) return { requests: [] };
    let q = supabaseAdmin
      .from("action_requests")
      .select("*")
      .eq("organization_id", role.orgId)
      .order("requested_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

// -- Request --------------------------------------------------------------
export const RequestActionInput = z.object({
  actionTypeId: z.string().uuid(),
  targetObjectId: z.string().min(1).max(255),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const requestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RequestActionInput.parse(i))
  .handler(async ({ data, context }) => {
    const role = await getOrgIdAndRole(context.userId);
    if (!role) throw new Error("No organization");

    const { data: at, error: atErr } = await supabaseAdmin
      .from("action_types")
      .select("*")
      .eq("id", data.actionTypeId)
      .eq("organization_id", role.orgId)
      .single();
    if (atErr || !at) throw new Error("Action type not found");
    if (!at.enabled) throw new Error("Action type is disabled");

    const validationErrors = evalValidation(
      (at.validation_rules as unknown as ValidationRule[]) ?? [],
      data.payload,
    );
    if (validationErrors.length) {
      throw new Error(`Validation failed: ${validationErrors.join("; ")}`);
    }

    const needsApproval = evalApproval(
      (at.requires_approval_rule as unknown as ApprovalRule | null) ?? null,
      data.payload,
    );

    const { data: req, error: reqErr } = await supabaseAdmin
      .from("action_requests")
      .insert({
        action_type_id: at.id,
        organization_id: role.orgId,
        target_object_id: data.targetObjectId,
        payload: data.payload as never,
        status: needsApproval ? "pending_approval" : "approved",
        requested_by: context.userId,
        approved_at: needsApproval ? null : new Date().toISOString(),
        approver_id: needsApproval ? null : context.userId,
      })
      .select()
      .single();
    if (reqErr || !req) throw new Error(reqErr?.message ?? "Insert failed");

    if (!needsApproval) {
      await tryDispatch(req.id, at, data.targetObjectId, data.payload);
    }

    return { requestId: req.id, status: needsApproval ? "pending_approval" : "dispatched" };
  });

// -- Approve / Reject -----------------------------------------------------
export const approveAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getOrgIdAndRole(context.userId);
    if (!role || role.role !== "admin") throw new Error("Admin role required");

    const { data: req, error } = await supabaseAdmin
      .from("action_requests")
      .select("*, action_types(*)")
      .eq("id", data.requestId)
      .eq("organization_id", role.orgId)
      .single();
    if (error || !req) throw new Error("Request not found");
    if (req.status !== "pending_approval") throw new Error(`Cannot approve from ${req.status}`);

    await supabaseAdmin
      .from("action_requests")
      .update({
        status: "approved",
        approver_id: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    await tryDispatch(
      req.id,
      req.action_types as never,
      req.target_object_id,
      (req.payload as Record<string, unknown>) ?? {},
    );
    return { ok: true };
  });

export const rejectAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getOrgIdAndRole(context.userId);
    if (!role || role.role !== "admin") throw new Error("Admin role required");
    const { error } = await supabaseAdmin
      .from("action_requests")
      .update({
        status: "rejected",
        approver_id: context.userId,
        approved_at: new Date().toISOString(),
        rejection_reason: data.reason,
      })
      .eq("id", data.requestId)
      .eq("organization_id", role.orgId)
      .eq("status", "pending_approval");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function tryDispatch(
  requestId: string,
  actionType: { webhook_url: string | null; api_name: string },
  targetObjectId: string,
  payload: Record<string, unknown>,
) {
  const url = actionType.webhook_url ?? process.env.N8N_WEBHOOK_URL;
  if (!url) {
    await supabaseAdmin
      .from("action_requests")
      .update({ status: "failed", dispatch_response: { error: "no webhook configured" } })
      .eq("id", requestId);
    return;
  }
  try {
    const res = await dispatchWebhook(url, {
      action_type: actionType.api_name,
      object_id: targetObjectId,
      payload,
      requested_at: new Date().toISOString(),
    });
    const ok = res.status >= 200 && res.status < 300;
    await supabaseAdmin
      .from("action_requests")
      .update({
        status: ok ? "succeeded" : "failed",
        dispatched_at: new Date().toISOString(),
        dispatch_response: { status: res.status, body: res.body },
      })
      .eq("id", requestId);
  } catch (err) {
    await supabaseAdmin
      .from("action_requests")
      .update({
        status: "failed",
        dispatched_at: new Date().toISOString(),
        dispatch_response: { error: err instanceof Error ? err.message : String(err) },
      })
      .eq("id", requestId);
  }
}
