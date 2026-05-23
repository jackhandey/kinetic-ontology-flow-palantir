/**
 * Lazy per-org bootstrap — populates ontology metadata, the default AIP
 * function, and default action types the first time an org is observed.
 * Idempotent (uses ON CONFLICT via .upsert).
 *
 * SERVER ONLY.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const OBJECT_TYPES = [
  { api_name: "active_asset", display_name: "Active Asset", icon: "truck", title_field: "trackingId" },
  { api_name: "shipping_route", display_name: "Shipping Route", icon: "route", title_field: "routeCode" },
  { api_name: "inventory_batch", display_name: "Inventory Batch", icon: "package", title_field: "sku" },
  { api_name: "risk_alert", display_name: "Risk Alert", icon: "alert-triangle", title_field: "headline" },
  { api_name: "operator", display_name: "Operator", icon: "user", title_field: "fullName" },
  { api_name: "customer_issue", display_name: "Customer Issue", icon: "ticket", title_field: "subject" },
  { api_name: "financial_risk", display_name: "Financial Risk", icon: "dollar-sign", title_field: "headline" },
  { api_name: "ontology_alert", display_name: "Ontology Alert", icon: "siren", title_field: "headline" },
];

const LINK_TYPES = [
  { api_name: "alert_impacts_asset", display_name: "Impacts", from: "risk_alert", to: "active_asset" },
  { api_name: "alert_impacts_route", display_name: "Impacts", from: "risk_alert", to: "shipping_route" },
  { api_name: "ontology_alert_impacts_asset", display_name: "Impacts", from: "ontology_alert", to: "active_asset" },
  { api_name: "asset_on_route", display_name: "Assigned to", from: "active_asset", to: "shipping_route" },
  { api_name: "route_carries_batch", display_name: "Carries", from: "shipping_route", to: "inventory_batch" },
  { api_name: "operator_drives_asset", display_name: "Drives", from: "operator", to: "active_asset" },
  { api_name: "issue_about_asset", display_name: "Concerns", from: "customer_issue", to: "active_asset" },
  { api_name: "risk_affects_asset", display_name: "Affects", from: "financial_risk", to: "active_asset" },
];

const DEFAULT_AIP_FUNCTION = {
  api_name: "evaluate_asset_risk",
  display_name: "Evaluate Asset Risk",
  description:
    "Senior logistics risk analyst — evaluates an ActiveAsset against recent telemetry/weather/traffic and returns a structured risk assessment.",
  model: "google/gemini-3-flash-preview",
  system_prompt:
    "You are a senior logistics risk analyst. Given an ActiveAsset and recent operational context, decide whether the asset is at meaningful risk in the next 24h and return a structured evaluation.",
};

const DEFAULT_ACTION_TYPES = [
  {
    api_name: "acknowledge_alert",
    display_name: "Acknowledge Alert",
    target_object_type: "ontology_alert",
    validation_rules: [],
    requires_approval_rule: null,
  },
  {
    api_name: "dispatch_response_team",
    display_name: "Dispatch Response Team",
    target_object_type: "ontology_alert",
    validation_rules: [],
    requires_approval_rule: { field: "exposureUsd", op: ">", value: 10000 },
  },
  {
    api_name: "reroute_asset",
    display_name: "Reroute Asset",
    target_object_type: "active_asset",
    validation_rules: [],
    requires_approval_rule: null,
  },
];

const DEFAULT_MARKINGS = [
  { code: "PII", description: "Personally identifiable information", color: "#f59e0b" },
  { code: "FINANCIAL", description: "Financial / monetary data", color: "#10b981" },
  { code: "CONFIDENTIAL", description: "Internal confidential", color: "#ef4444" },
];

let bootstrappedOrgs = new Set<string>();

export async function ensureOrgBootstrap(organizationId: string): Promise<void> {
  if (bootstrappedOrgs.has(organizationId)) return;

  // Object types
  const { data: insertedTypes } = await supabaseAdmin
    .from("ontology_object_types")
    .upsert(
      OBJECT_TYPES.map((t) => ({ ...t, organization_id: organizationId })),
      { onConflict: "organization_id,api_name", ignoreDuplicates: true },
    )
    .select("id, api_name");

  // Read back full type list (upsert with ignoreDuplicates won't return existing)
  const { data: allTypes } = await supabaseAdmin
    .from("ontology_object_types")
    .select("id, api_name")
    .eq("organization_id", organizationId);

  const typeIdByApi = new Map<string, string>();
  for (const t of allTypes ?? []) typeIdByApi.set(t.api_name, t.id);

  // Link types
  const linkRows = LINK_TYPES.flatMap((lt) => {
    const from = typeIdByApi.get(lt.from);
    const to = typeIdByApi.get(lt.to);
    if (!from || !to) return [];
    return [{
      organization_id: organizationId,
      api_name: lt.api_name,
      display_name: lt.display_name,
      from_object_type_id: from,
      to_object_type_id: to,
      cardinality: "many_to_many" as const,
    }];
  });
  if (linkRows.length) {
    await supabaseAdmin
      .from("ontology_link_types")
      .upsert(linkRows, { onConflict: "organization_id,api_name", ignoreDuplicates: true });
  }

  // AIP function
  await supabaseAdmin
    .from("aip_functions")
    .upsert(
      [{ ...DEFAULT_AIP_FUNCTION, organization_id: organizationId }],
      { onConflict: "organization_id,api_name", ignoreDuplicates: true },
    );

  // Action types
  await supabaseAdmin
    .from("action_types")
    .upsert(
      DEFAULT_ACTION_TYPES.map((a) => ({ ...a, organization_id: organizationId })),
      { onConflict: "organization_id,api_name", ignoreDuplicates: true },
    );

  // Markings
  await supabaseAdmin
    .from("classification_markings")
    .upsert(
      DEFAULT_MARKINGS.map((m) => ({ ...m, organization_id: organizationId })),
      { onConflict: "organization_id,code", ignoreDuplicates: true },
    );

  bootstrappedOrgs.add(organizationId);
  // Avoid unbounded growth across the worker lifetime.
  if (bootstrappedOrgs.size > 1000) bootstrappedOrgs = new Set();
  void insertedTypes;
}
