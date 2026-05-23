/**
 * Action dispatch — fires a webhook (n8n) when an operator confirms an action.
 *
 * The server function NEVER writes to ontology tables directly. It is a
 * thin authenticated proxy that forwards { object_id, action_type } to the
 * configured N8N webhook and reports the upstream response back to the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const DispatchActionInputSchema = z.object({
  objectId: z.string().min(1).max(255),
  actionType: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_\-.]+$/i, "actionType must be alphanumeric/underscore"),
  objectKind: z.enum(["ontology_alert", "active_asset"]),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type DispatchActionInput = z.infer<typeof DispatchActionInputSchema>;

export const dispatchAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DispatchActionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error("N8N_WEBHOOK_URL is not configured");
    }

    const payload = {
      object_id: data.objectId,
      action_type: data.actionType,
      object_kind: data.objectKind,
      organization_id: context.userId, // org scope is implicit via caller
      dispatched_by: context.userId,
      dispatched_at: new Date().toISOString(),
      context: data.context ?? {},
    };

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => "");
      throw new Error(
        `Webhook returned ${upstream.status} ${upstream.statusText}${body ? `: ${body.slice(0, 200)}` : ""}`,
      );
    }

    return { status: upstream.status, dispatchedAt: payload.dispatched_at };
  });
