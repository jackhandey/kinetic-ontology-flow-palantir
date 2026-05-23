# Groundwork: Foundry/AIP-style Capabilities

Scope: lay the *foundations* (DB tables, server functions, schemas, minimal UI affordances) for each of the 6 missing capabilities. No external integrations, no new sign-ups — everything runs on Lovable Cloud (Supabase) + TanStack server functions + Lovable AI Gateway (already configured via `LOVABLE_API_KEY`).

This is a structural pass, not a finished product. Each layer gets the minimum primitives so future work plugs into a real contract instead of mock data.

---

## 1. Data Integration Engine (Pipelines)

Today raw_* tables are populated by an unseen n8n. We add a first-party pipeline registry so transforms become a tracked, inspectable concept.

**DB (new tables):**
- `pipelines` — `id`, `organization_id`, `name`, `source_table` (text), `target_object_type` (text, e.g. `active_asset`), `transform_sql` (text, nullable), `schedule_cron` (text, nullable), `enabled` (bool), `created_at`.
- `pipeline_runs` — `id`, `pipeline_id`, `organization_id`, `started_at`, `finished_at`, `status` enum(`pending|running|succeeded|failed`), `rows_in`, `rows_out`, `error`, `log` (jsonb).

RLS: org-scoped read for members; writes via service role / server fn only.

**Server fn (`src/lib/pipelines/pipelines.functions.ts`):**
- `listPipelines`, `listPipelineRuns(pipelineId)`
- `runPipeline({pipelineId})` — auth-protected; records a `pipeline_runs` row, scans `raw_*` rows where `processed_status=false`, delegates to existing `mappers.server.ts`, marks them processed. This formalizes the Layer 1→Layer 2 hop.

## 2. Ontology Manager

Right now object types are hardcoded TS interfaces. Add a metadata registry so the ontology is data, not just code.

**DB:**
- `ontology_object_types` — `id`, `organization_id`, `api_name` (e.g. `active_asset`), `display_name`, `description`, `icon`, `primary_key_field`, `title_field`.
- `ontology_properties` — `id`, `object_type_id`, `api_name`, `display_name`, `data_type` (`string|number|bool|datetime|geo|enum`), `required` bool, `sensitivity` (text, see §3).
- `ontology_link_types` — `id`, `organization_id`, `api_name`, `from_object_type_id`, `to_object_type_id`, `cardinality` (`one_to_one|one_to_many|many_to_many`), `display_name`.
- `ontology_object_links` — instance-level edges: `id`, `organization_id`, `link_type_id`, `from_object_id` (text), `to_object_id` (text), `created_at`. Indexes on both endpoints. This is what powers §6 graph view.

Seed migration inserts the 7 existing schemas (`ActiveAsset`, `ShippingRoute`, `InventoryBatch`, `RiskAlert`, `Operator`, `CustomerIssue`, `FinancialRisk`) + plausible links (`Alert→Asset`, `Asset→Route`, `Route→InventoryBatch`, `Operator→Asset`, `Issue→Asset`).

**Server fns (`src/lib/ontology/manager.functions.ts`):** `listObjectTypes`, `listLinkTypes`, `getObjectLinks({objectId})`.

## 3. Granular Security (Markings)

Add classification markings layered on top of existing RLS, without replacing it.

**DB:**
- `classification_markings` — `id`, `organization_id`, `code` (e.g. `PII`, `FINANCIAL`, `CONFIDENTIAL`), `description`, `color`.
- `user_marking_grants` — `user_id`, `organization_id`, `marking_id` — which markings a user is cleared for.
- `object_markings` — `id`, `organization_id`, `object_type` text, `object_id` text, `marking_id` — applied to a specific instance.
- Add `sensitivity` text column to `ontology_properties` to mark column-level (clients filter / mask).

**Helpers:**
- SQL `SECURITY DEFINER` function `user_has_marking(_user_id, _marking_id) → bool`.
- Server fn `applyMarking`, `listMarkings`, `getUserMarkings`.
- A small client helper `maskValue(value, sensitivity, userMarkings)` for UI use.

(We're not rewriting every RLS policy today — we wire the primitives so callers can opt in.)

## 4. AIP Logic (AI Orchestration)

`risk-evaluator.server.ts` already calls Lovable AI. We promote it into a generic, recorded orchestration layer.

**DB:**
- `aip_functions` — `id`, `organization_id`, `name`, `description`, `model` (default `google/gemini-2.5-flash`), `system_prompt`, `input_schema` (jsonb, zod-compatible), `output_schema` (jsonb).
- `aip_function_invocations` — `id`, `aip_function_id`, `organization_id`, `input` (jsonb), `output` (jsonb), `model`, `tokens_in`, `tokens_out`, `latency_ms`, `status`, `error`, `invoked_by`, `invoked_at`.

**Server fns (`src/lib/aip/aip.functions.ts`):** `listAipFunctions`, `invokeAipFunction({id, input})` — looks up the function record, calls Lovable AI Gateway with structured output (tool-calling) using the stored schema, persists the invocation. Refactor the existing risk evaluator to register itself as the first `aip_function` row via seed migration.

## 5. Action Validation & Approvals

`dispatchAction` currently just fires a webhook. Add a real action framework around it.

**DB:**
- `action_types` — `id`, `organization_id`, `api_name`, `display_name`, `description`, `target_object_type`, `webhook_url` (nullable — falls back to env), `validation_rules` (jsonb), `requires_approval_rule` (jsonb, e.g. `{"field":"exposure_usd","op":">","value":10000}`).
- `action_requests` — `id`, `action_type_id`, `organization_id`, `target_object_id`, `payload` (jsonb), `status` enum(`pending_approval|approved|rejected|dispatched|failed|succeeded`), `requested_by`, `requested_at`, `approver_id`, `approved_at`, `rejection_reason`, `dispatch_response` (jsonb).

**Server fns (`src/lib/actions/action-framework.functions.ts`):**
- `requestAction({actionTypeId, targetObjectId, payload})` — validates payload against `validation_rules`, evaluates `requires_approval_rule`, either marks `pending_approval` or auto-dispatches.
- `approveAction({requestId})` / `rejectAction({requestId, reason})` — admin-only via `has_role`. On approve → call existing webhook dispatch, store response.
- Update existing `dispatchAction` to delegate through this framework when given an `actionTypeId`; keep ad-hoc path for back-compat.

## 6. Relational Graphing / Object Explorer

A real graph viewer is heavy; we build the data plumbing + minimal UI so it's usable today.

**Server fn (`src/lib/ontology/graph.functions.ts`):**
- `getObjectGraph({objectType, objectId, depth=1})` — walks `ontology_object_links` up to `depth` (max 2), returns `{nodes: [{id,type,title}], edges: [{from,to,linkType}]}`.

**UI:** new route `src/routes/objects/$type.$id.tsx` — given an object type + id, fetches the graph, renders a simple node-and-edge list (grouped by link type) + a `<details>` per neighbor showing its props. No SVG/canvas library — just a structured, navigable view that doubles as the foundation for a future Vertex-style viewer. Each neighbor is a `<Link>` to its own `/objects/$type/$id` page.

Add a tiny "Explore" button next to alerts/assets on the dashboard linking into the new route.

---

## Execution order (one migration + ~10 new files)

1. `supabase--migration` adding all new tables, enums, RLS, helper fns, and seed rows for the 7 existing object types + their link types + the existing risk-evaluator as an `aip_function`.
2. New server-fn modules under `src/lib/{pipelines,ontology,aip,actions}/`.
3. Refactor `risk-evaluator.server.ts` to log into `aip_function_invocations`; refactor `actions.functions.ts` to route through the new framework when given `actionTypeId`.
4. Add `src/routes/objects/$type.$id.tsx` and a small "Explore" link on the dashboard.

## Explicitly NOT in scope

- No graph SVG/canvas library, no Vertex clone.
- No row/column-level RLS rewrite — markings are primitives + helpers.
- No pipeline DSL/visual builder — `transform_sql` is a stored string for now.
- No n8n replacement.
- No new third-party signups (uses existing Lovable Cloud + Lovable AI Gateway).

Confirm and I'll start with the migration.
