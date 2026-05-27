
## Goal

Restructure action dispatch so the ontology (Supabase) is the **authoritative operational core**. Every action flows: UI → server fn → (auth + org check) → **fetch target object** → **domain validation** → **audit log** → dispatch to n8n → n8n writes state back. Keep the stack lightweight (no new infra).

## Current state

Two parallel dispatch paths exist:

1. `src/lib/actions/action-framework.functions.ts` — has auth, org membership, payload validation, approval gating, `action_requests` row, RPC/webhook dispatch. **Missing**: target-object fetch + domain rules against that object, and explicit `audit_log` writes.
2. `src/lib/ontology/actions.functions.ts` — thin webhook proxy. No target fetch, no validation, no audit. **Legacy / overlapping.**

The `audit_log` table + `audit_tasks` trigger already exist; only `tasks` writes audit rows today.

## Changes

### 1. Add a target-object resolver (server-only)

New file `src/lib/actions/target-resolver.server.ts`:
- `resolveTarget(orgId, objectType, objectId)` returns a typed snapshot `{ type, id, status, payload }`.
- Supported types map to existing ontology sources:
  - `ontology_alert` → `ontology_alerts` row
  - `active_asset` → latest `raw_asset_status` / `raw_fleet_status` row via existing mappers
  - `task` → `tasks` row
- Throws `TargetNotFoundError` / `TargetNotInOrgError` (org guard re-checked even though service role).

### 2. Add domain rules per action

Extend `action_types.validation_rules` semantics with an optional `target` scope:
```ts
type ValidationRule = { scope?: "payload" | "target"; field: string; op: ...; value?: unknown }
```
Default `scope: "payload"` (back-compat). `scope: "target"` evaluates against the resolved target snapshot.

Example domain rule: `resolve_ontology_alert` requires `target.resolved_at == null`; `mark_task_complete` requires `target.status != "complete"`.

Pure logic, no schema change required (rules are JSONB).

### 3. Wire resolver + domain validation into `requestAction`

In `action-framework.functions.ts` → `requestAction.handler`:
1. After loading `action_type`, call `resolveTarget(orgId, at.target_object_type, data.targetObjectId)`.
2. Split rules by scope; evaluate payload rules + target rules; merge errors.
3. Pass `target` into `tryDispatch` so the webhook body includes a normalized `target` snapshot (n8n no longer needs to re-fetch).
4. Reject with a clear domain error if target missing / wrong org / fails rules.

### 4. Write `audit_log` rows for every action lifecycle event

In `requestAction`, `approveAction`, `rejectAction`, `tryDispatch` (success + failure):
- Insert into `public.audit_log` with `object_type='action_request'`, `object_id=request.id`, `actor_id`, `action` ∈ `requested|approved|rejected|dispatched|failed`, and a compact `diff` (payload, target snapshot, dispatch response).
- Use `supabaseAdmin` (RLS-bypassing) since the table is read-only for org members; admin writes are intentional.

### 5. Replace legacy `dispatchAction`

`src/lib/ontology/actions.functions.ts`:
- Re-export thin wrapper that internally calls `requestAction` with a resolved `actionTypeId` looked up by `(target_object_type, api_name)` for back-compat, OR delete after confirming no remaining callers.
- Quick grep: only `ActionsPanel` uses the new `requestAction`; legacy `dispatchAction` appears unused in current UI. Delete it and remove the file.

### 6. Webhook payload contract (sent to n8n)

```json
{
  "request_id": "...",
  "action_type": "resolve_ontology_alert",
  "organization_id": "...",
  "requested_by": "...",
  "target": { "type": "ontology_alert", "id": "...", "status": "open", "snapshot": {...} },
  "payload": {...},
  "requested_at": "..."
}
```
n8n writes state back via existing Supabase REST/RPC (e.g. `resolve_ontology_alert`), which is already in the RPC allowlist. No new inbound webhook needed for this iteration.

### 7. Tests / verification

- Manual: from the dashboard `ActionsPanel`, fire `resolve_ontology_alert` on an already-resolved alert → expect domain-rule rejection, `action_requests.status=failed`, `audit_log` row with `action=failed`.
- Fire on an open alert → expect `succeeded`, both `action_requests` and `audit_log` rows written, alert `resolved_at` set.

## Files touched

- **new** `src/lib/actions/target-resolver.server.ts`
- **edit** `src/lib/actions/action-framework.functions.ts` (resolver call, target-scoped validation, audit_log writes, enriched webhook body)
- **edit/delete** `src/lib/ontology/actions.functions.ts` (remove legacy proxy)
- No DB migration required (audit_log + validation_rules JSONB already support this).

## Out of scope

- pg_net / DB-side WAL triggers — the server fn already sits between UI and n8n and is the right place for auth + domain logic. Adding pg_net would duplicate dispatch surface area without adding authority.
- New ontology object types or schema changes.
