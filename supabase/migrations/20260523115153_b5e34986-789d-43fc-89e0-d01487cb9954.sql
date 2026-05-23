-- Three additional raw staging tables, following the existing pattern
create table public.raw_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  raw_payload jsonb not null,
  processed_status boolean not null default false,
  source_system text,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.raw_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  raw_payload jsonb not null,
  processed_status boolean not null default false,
  source_system text,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.raw_fleet_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  raw_payload jsonb not null,
  processed_status boolean not null default false,
  source_system text,
  ingested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Indexes consistent with existing raw_* tables
create index idx_raw_tickets_unprocessed
  on public.raw_tickets (organization_id, ingested_at desc)
  where processed_status = false;
create index idx_raw_tickets_payload_gin
  on public.raw_tickets using gin (raw_payload);

create index idx_raw_transactions_unprocessed
  on public.raw_transactions (organization_id, ingested_at desc)
  where processed_status = false;
create index idx_raw_transactions_payload_gin
  on public.raw_transactions using gin (raw_payload);

create index idx_raw_fleet_status_unprocessed
  on public.raw_fleet_status (organization_id, ingested_at desc)
  where processed_status = false;
create index idx_raw_fleet_status_payload_gin
  on public.raw_fleet_status using gin (raw_payload);

-- Enable RLS
alter table public.raw_tickets enable row level security;
alter table public.raw_transactions enable row level security;
alter table public.raw_fleet_status enable row level security;

-- SELECT for org members only. No INSERT/UPDATE/DELETE policies =>
-- end-users cannot write. Service role bypasses RLS, so n8n / ontology
-- layer (supabaseAdmin) is the only writer.
create policy "Org members can read raw_tickets"
  on public.raw_tickets for select to authenticated
  using (organization_id in (select current_user_orgs()));

create policy "Org members can read raw_transactions"
  on public.raw_transactions for select to authenticated
  using (organization_id in (select current_user_orgs()));

create policy "Org members can read raw_fleet_status"
  on public.raw_fleet_status for select to authenticated
  using (organization_id in (select current_user_orgs()));