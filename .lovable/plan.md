## Step 1 — Database Foundation (Raw Layer Only)

This plan covers **only Layer 1: Raw Data**. No ontology code, no Edge Functions, no UI. Tables are populated externally by n8n via service role.

### Architectural note (please confirm)

Your spec says "Supabase Edge Functions" for Layer 2. This template runs on Cloudflare Workers (TanStack Start) and the house convention is `createServerFn` for app-internal logic, with Supabase Edge Functions reserved for external webhooks or in-database triggers. The Zod ontology + server-function pattern delivers identical guarantees to the UI (UI still touches only the ontology, never `raw_*` tables). I'll proceed on that basis unless you tell me you need Deno Edge Functions specifically — flag it and we'll plan exceptions.

### 1. Enable Lovable Cloud

Provisions Postgres, Auth, Storage, and the server runtime. No external accounts needed.

### 2. Tenancy primitives

Create the org scoping and role machinery before any data table so RLS can reference them from day one:

- `organizations` — `id uuid pk`, `name text`, `created_at`
- `app_role` enum — `admin`, `operator`, `viewer`
- `user_roles` — `(user_id, organization_id, role)`, unique on the triple. **Roles live here, never on a profile/users table** (prevents privilege escalation).
- `has_role(_user_id, _org_id, _role)` — `SECURITY DEFINER` function used by all RLS policies to avoid recursive policy checks.
- `current_user_orgs()` — `SECURITY DEFINER` helper returning the set of orgs the caller belongs to, used in `USING` clauses.

### 3. The 9 raw staging tables

Each table follows the **pure raw mirror** philosophy — minimal opinion, n8n owns the shape inside `raw_payload`.

Tables: `raw_telemetry_logs`, `raw_asset_status`, `raw_freight_orders`, `raw_route_plans`, `raw_inventory_batches`, `raw_shipping_manifests`, `raw_weather_conditions`, `raw_traffic_incidents`, `raw_driver_logs`.

Uniform column set on every table:

```text
id                uuid primary key default gen_random_uuid()
organization_id   uuid not null references organizations(id) on delete cascade
raw_payload       jsonb not null
processed_status  boolean not null default false
source_system     text                    -- which n8n pipeline produced this
ingested_at       timestamptz not null default now()
processed_at      timestamptz             -- set by ontology layer when consumed
```

Indexes per table:
- `(organization_id, processed_status, ingested_at desc)` — primary read pattern for the ontology layer claiming unprocessed rows
- GIN on `raw_payload` — ad-hoc inspection / future semantic queries

### 4. Row-Level Security (every raw table)

RLS enabled on all 9 tables plus `organizations` and `user_roles`. Policy matrix:

| Action | Who | Rule |
|---|---|---|
| `SELECT` | members of the org | `organization_id in (select current_user_orgs())` |
| `INSERT` / `UPDATE` / `DELETE` from end-users | nobody | no policy granted to `authenticated` |
| Writes | n8n & ontology layer | via service role key (bypasses RLS) |

This matches your model: n8n writes raw rows server-side; humans read-only via their org; the ontology layer (server functions with `supabaseAdmin`) is the only thing that flips `processed_status`.

### 5. What is explicitly NOT in this step

- No business-object tables (`ActiveAsset`, `ShippingRoute`, etc.) — those are derived views/materializations owned by Layer 2.
- No Zod schemas, no server functions, no Edge Functions.
- No React components, no routes, no auth screens.
- No seed data.

### Deliverable

One migration creating: enum, `organizations`, `user_roles`, two helper functions, 9 raw tables, indexes, RLS policies. After it runs, the database is ready for n8n to begin populating `raw_payload` blobs and for us to design Layer 2 in the next step.

### Open questions before I build

1. **Org bootstrap** — how does a user first land in an `organizations` row? Auto-create on signup (one org per signup) or invite-only (admin seeds orgs)? Affects whether we add a signup trigger now or defer.
2. **`source_system` enum vs free text** — keep as `text` for n8n flexibility, or lock to a known set?
3. Confirm the Edge-Functions-vs-server-functions note above is acceptable.
