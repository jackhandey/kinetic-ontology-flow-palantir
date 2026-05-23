create table public.ontology_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_asset_id text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  category text not null,
  headline text not null,
  description text,
  impacted_asset_ids text[] not null default '{}',
  impacted_route_ids text[] not null default '{}',
  exposure_usd numeric,
  evaluation_model text,
  evaluation_payload jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_ontology_alerts_org_detected
  on public.ontology_alerts (organization_id, detected_at desc);
create index idx_ontology_alerts_source_asset
  on public.ontology_alerts (organization_id, source_asset_id);

alter table public.ontology_alerts enable row level security;

-- Read for org members only. No INSERT/UPDATE/DELETE policies =>
-- service role (the cron worker via supabaseAdmin) is the only writer.
create policy "Org members can read ontology_alerts"
  on public.ontology_alerts for select to authenticated
  using (organization_id in (select current_user_orgs()));