/**
 * Self-Evolving Schema + Semantic CSV Auto-Mapping.
 *
 * - scanRawForProposals: samples a raw_* table, asks the LLM to propose a new
 *   ontology object type or extra fields, stores as a schema_proposal.
 * - analyzeCsvProposal: takes CSV headers + sample rows, asks the LLM to map
 *   them to an existing ontology_object_type (or suggest a new one), stores
 *   the mapping as a schema_proposal.
 * - listProposals / promoteProposal / rejectProposal: admin review surface.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getOrgRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("organization_id, role")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data ? { orgId: data.organization_id as string, role: data.role as string } : null;
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Lovable AI is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (res.status === 429) throw new Error("Rate limit exceeded");
  if (res.status === 402) throw new Error("AI credits exhausted");
  if (!res.ok) throw new Error(`AI gateway error ${res.status}`);
  const body = await res.json();
  return body?.choices?.[0]?.message?.content ?? "{}";
}

const RAW_TABLES = [
  "raw_asset_status","raw_driver_logs","raw_fleet_status","raw_freight_orders",
  "raw_inventory_batches","raw_route_plans","raw_shipping_manifests",
  "raw_telemetry_logs","raw_tickets","raw_traffic_incidents",
  "raw_transactions","raw_weather_conditions",
] as const;

export const scanRawForProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ rawTable: z.enum(RAW_TABLES) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getOrgRole(context.userId);
    if (!role) throw new Error("No organization");

    // Pull a sample of recent raw rows.
    const { data: rows, error } = await supabaseAdmin
      .from(data.rawTable)
      .select("raw_payload, source_system, ingested_at")
      .eq("organization_id", role.orgId)
      .order("ingested_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      return { ok: false as const, message: "No rows found in raw table" };
    }

    // Existing object types so we can suggest "extend" vs "new".
    const { data: existing } = await supabaseAdmin
      .from("ontology_object_types")
      .select("api_name, display_name, description")
      .eq("organization_id", role.orgId);

    const system = [
      "You are an ontology architect. Given a sample of raw ingest rows and",
      "the existing ontology, propose ONE of:",
      '  {"kind":"new_object_type","api_name":"snake_case","display_name":"...",',
      '   "description":"...","fields":[{"api_name":"...","display_name":"...",',
      '   "data_type":"string|number|boolean|timestamp|json","required":bool}]}',
      "OR",
      '  {"kind":"extend_object_type","api_name":"existing","new_fields":[...]}',
      "Return a single JSON object — no commentary.",
    ].join(" ");
    const user = JSON.stringify({
      raw_table: data.rawTable,
      existing_types: existing ?? [],
      sample_rows: rows.map((r) => r.raw_payload),
    }).slice(0, 12000);

    const raw = await callAI(system, user);
    let proposal: Record<string, unknown> = {};
    try { proposal = JSON.parse(raw); } catch { proposal = { kind: "unparseable", raw }; }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("schema_proposals")
      .insert({
        organization_id: role.orgId,
        proposed_by: context.userId,
        source: `raw_scan:${data.rawTable}`,
        title:
          (proposal.kind === "new_object_type"
            ? `New object type: ${proposal.display_name ?? proposal.api_name}`
            : proposal.kind === "extend_object_type"
              ? `Extend ${proposal.api_name}`
              : `Proposal from ${data.rawTable}`) as string,
        rationale: `LLM scan of ${rows.length} recent rows from ${data.rawTable}`,
        proposal: proposal as never,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true as const, proposal: inserted };
  });

export const analyzeCsvProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      filename: z.string().min(1).max(255),
      headers: z.array(z.string()).min(1).max(80),
      sampleRows: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getOrgRole(context.userId);
    if (!role) throw new Error("No organization");

    const { data: existing } = await supabaseAdmin
      .from("ontology_object_types")
      .select("api_name, display_name, description")
      .eq("organization_id", role.orgId);

    const system = [
      "You map CSV imports into a Palantir-style ontology.",
      "Output JSON only:",
      '  {"target":"existing_api_name"|null,"suggested_new_type":{...}|null,',
      '   "header_mapping":[{"csv":"...","ontology":"...","confidence":0..1}],',
      '   "candidate_links":[{"from_field":"...","to_object_type":"..."}]}',
      "Prefer mapping to existing types when semantically close.",
    ].join(" ");
    const user = JSON.stringify({
      filename: data.filename,
      existing_types: existing ?? [],
      headers: data.headers,
      sample: data.sampleRows.slice(0, 10),
    }).slice(0, 12000);

    const raw = await callAI(system, user);
    let mapping: Record<string, unknown> = {};
    try { mapping = JSON.parse(raw); } catch { mapping = { kind: "unparseable", raw }; }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("schema_proposals")
      .insert({
        organization_id: role.orgId,
        proposed_by: context.userId,
        source: `csv:${data.filename}`,
        title: `CSV mapping: ${data.filename}`,
        rationale: `Auto-mapped ${data.headers.length} columns from ${data.filename}`,
        proposal: { kind: "csv_mapping", ...mapping } as never,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return { ok: true as const, proposal: inserted, mappingJson: JSON.stringify(mapping) };
  });

export const listProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getOrgRole(context.userId);
    if (!role) return { proposals: [] };
    const { data } = await supabaseAdmin
      .from("schema_proposals")
      .select("*")
      .eq("organization_id", role.orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { proposals: data ?? [] };
  });

export const decideProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      id: z.string().uuid(),
      decision: z.enum(["promoted", "rejected"]),
      note: z.string().max(500).optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getOrgRole(context.userId);
    if (!role || role.role !== "admin") throw new Error("Admin role required");

    const { data: prop } = await supabaseAdmin
      .from("schema_proposals")
      .select("*")
      .eq("id", data.id)
      .eq("organization_id", role.orgId)
      .single();
    if (!prop) throw new Error("Proposal not found");

    // On promote: best-effort apply for "new_object_type" — create the type
    // and its properties. Other kinds are marked promoted for ops to wire.
    if (data.decision === "promoted") {
      const p = prop.proposal as { kind?: string; api_name?: string; display_name?: string; description?: string; fields?: Array<{ api_name: string; display_name: string; data_type: string; required?: boolean }> };
      if (p.kind === "new_object_type" && p.api_name && p.display_name) {
        const { data: ot, error: otErr } = await supabaseAdmin
          .from("ontology_object_types")
          .insert({
            organization_id: role.orgId,
            api_name: p.api_name,
            display_name: p.display_name,
            description: p.description ?? null,
          })
          .select()
          .single();
        if (otErr) throw new Error(otErr.message);
        if (ot && Array.isArray(p.fields)) {
          const props = p.fields.slice(0, 50).map((f) => ({
            object_type_id: ot.id,
            api_name: f.api_name,
            display_name: f.display_name,
            data_type: (["string","number","boolean","timestamp","json"].includes(f.data_type) ? f.data_type : "string") as "string"|"number"|"boolean"|"timestamp"|"json",
            required: !!f.required,
          }));
          if (props.length) {
            await supabaseAdmin.from("ontology_properties").insert(props as never);
          }
        }
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from("schema_proposals")
      .update({
        status: data.decision,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        decision_note: data.note ?? null,
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, proposal: updated };
  });
