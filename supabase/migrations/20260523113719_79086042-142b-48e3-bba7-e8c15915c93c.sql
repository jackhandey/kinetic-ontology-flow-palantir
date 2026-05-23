
-- =====================================================================
-- TENANCY PRIMITIVES
-- =====================================================================

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create type public.app_role as enum ('admin', 'operator', 'viewer');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, organization_id, role)
);

create index user_roles_user_idx on public.user_roles(user_id);
create index user_roles_org_idx on public.user_roles(organization_id);

-- SECURITY DEFINER helpers (avoid recursive RLS)
create or replace function public.has_role(_user_id uuid, _org_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and organization_id = _org_id and role = _role
  );
$$;

create or replace function public.current_user_orgs()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select organization_id from public.user_roles where user_id = auth.uid();
$$;

-- =====================================================================
-- RLS: organizations & user_roles
-- =====================================================================

alter table public.organizations enable row level security;
alter table public.user_roles enable row level security;

create policy "Members can view their organizations"
  on public.organizations for select
  to authenticated
  using (id in (select public.current_user_orgs()));

create policy "Admins can update their organization"
  on public.organizations for update
  to authenticated
  using (public.has_role(auth.uid(), id, 'admin'))
  with check (public.has_role(auth.uid(), id, 'admin'));

create policy "Users can view their own role assignments"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "Org admins can view roles in their organization"
  on public.user_roles for select
  to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'));

create policy "Org admins can manage roles in their organization"
  on public.user_roles for all
  to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'))
  with check (public.has_role(auth.uid(), organization_id, 'admin'));

-- =====================================================================
-- RAW STAGING TABLES (9) — pure raw mirror
-- =====================================================================

do $$
declare
  t text;
  raw_tables text[] := array[
    'raw_telemetry_logs',
    'raw_asset_status',
    'raw_freight_orders',
    'raw_route_plans',
    'raw_inventory_batches',
    'raw_shipping_manifests',
    'raw_weather_conditions',
    'raw_traffic_incidents',
    'raw_driver_logs'
  ];
begin
  foreach t in array raw_tables loop
    execute format($f$
      create table public.%I (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references public.organizations(id) on delete cascade,
        raw_payload jsonb not null,
        processed_status boolean not null default false,
        source_system text,
        ingested_at timestamptz not null default now(),
        processed_at timestamptz
      );
    $f$, t);

    execute format('create index %I on public.%I (organization_id, processed_status, ingested_at desc);',
                   t || '_org_unprocessed_idx', t);
    execute format('create index %I on public.%I using gin (raw_payload);',
                   t || '_payload_gin_idx', t);

    execute format('alter table public.%I enable row level security;', t);

    -- Read-only access for org members. Writes go through service role (n8n + ontology layer).
    execute format($p$
      create policy "Org members can read %1$s"
        on public.%1$I for select
        to authenticated
        using (organization_id in (select public.current_user_orgs()));
    $p$, t);
  end loop;
end$$;
