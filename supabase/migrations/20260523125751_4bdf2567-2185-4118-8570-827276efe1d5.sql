
-- =========================================================================
-- 1. PIPELINES
-- =========================================================================
create type public.pipeline_run_status as enum ('pending','running','succeeded','failed');

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  source_table text not null,
  target_object_type text not null,
  transform_sql text,
  schedule_cron text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pipelines_org_idx on public.pipelines(organization_id);

create table public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.pipeline_run_status not null default 'pending',
  rows_in integer not null default 0,
  rows_out integer not null default 0,
  error text,
  log jsonb not null default '{}'::jsonb,
  triggered_by uuid
);
create index pipeline_runs_pipeline_idx on public.pipeline_runs(pipeline_id, started_at desc);
create index pipeline_runs_org_idx on public.pipeline_runs(organization_id, started_at desc);

alter table public.pipelines enable row level security;
alter table public.pipeline_runs enable row level security;

create policy "Org members read pipelines" on public.pipelines for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage pipelines" on public.pipelines for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read pipeline_runs" on public.pipeline_runs for select to authenticated
  using (organization_id in (select public.current_user_orgs()));

-- =========================================================================
-- 2. ONTOLOGY MANAGER
-- =========================================================================
create type public.ontology_data_type as enum ('string','number','bool','datetime','geo','enum','json');
create type public.ontology_cardinality as enum ('one_to_one','one_to_many','many_to_many');

create table public.ontology_object_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_name text not null,
  display_name text not null,
  description text,
  icon text,
  primary_key_field text not null default 'id',
  title_field text not null default 'id',
  created_at timestamptz not null default now(),
  unique (organization_id, api_name)
);

create table public.ontology_properties (
  id uuid primary key default gen_random_uuid(),
  object_type_id uuid not null references public.ontology_object_types(id) on delete cascade,
  api_name text not null,
  display_name text not null,
  data_type public.ontology_data_type not null,
  required boolean not null default false,
  sensitivity text,
  unique (object_type_id, api_name)
);

create table public.ontology_link_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_name text not null,
  display_name text not null,
  from_object_type_id uuid not null references public.ontology_object_types(id) on delete cascade,
  to_object_type_id uuid not null references public.ontology_object_types(id) on delete cascade,
  cardinality public.ontology_cardinality not null default 'many_to_many',
  unique (organization_id, api_name)
);

create table public.ontology_object_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_type_id uuid not null references public.ontology_link_types(id) on delete cascade,
  from_object_id text not null,
  to_object_id text not null,
  created_at timestamptz not null default now()
);
create index ool_from_idx on public.ontology_object_links(organization_id, from_object_id);
create index ool_to_idx on public.ontology_object_links(organization_id, to_object_id);
create index ool_link_type_idx on public.ontology_object_links(link_type_id);

alter table public.ontology_object_types enable row level security;
alter table public.ontology_properties enable row level security;
alter table public.ontology_link_types enable row level security;
alter table public.ontology_object_links enable row level security;

create policy "Org members read object_types" on public.ontology_object_types for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage object_types" on public.ontology_object_types for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read properties" on public.ontology_properties for select to authenticated
  using (object_type_id in (select id from public.ontology_object_types where organization_id in (select public.current_user_orgs())));
create policy "Org admins manage properties" on public.ontology_properties for all to authenticated
  using (object_type_id in (select id from public.ontology_object_types where public.has_role(auth.uid(), organization_id, 'admin'::app_role)))
  with check (object_type_id in (select id from public.ontology_object_types where public.has_role(auth.uid(), organization_id, 'admin'::app_role)));

create policy "Org members read link_types" on public.ontology_link_types for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage link_types" on public.ontology_link_types for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read object_links" on public.ontology_object_links for select to authenticated
  using (organization_id in (select public.current_user_orgs()));

-- =========================================================================
-- 3. CLASSIFICATION MARKINGS
-- =========================================================================
create table public.classification_markings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  description text,
  color text,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.user_marking_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  marking_id uuid not null references public.classification_markings(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  unique (user_id, marking_id)
);

create table public.object_markings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  marking_id uuid not null references public.classification_markings(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (object_type, object_id, marking_id)
);
create index om_lookup_idx on public.object_markings(organization_id, object_type, object_id);

alter table public.classification_markings enable row level security;
alter table public.user_marking_grants enable row level security;
alter table public.object_markings enable row level security;

create policy "Org members read markings" on public.classification_markings for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage markings" on public.classification_markings for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Users read own grants" on public.user_marking_grants for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), organization_id, 'admin'::app_role));
create policy "Org admins manage grants" on public.user_marking_grants for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read object_markings" on public.object_markings for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage object_markings" on public.object_markings for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create or replace function public.user_has_marking(_user_id uuid, _marking_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_marking_grants
    where user_id = _user_id and marking_id = _marking_id
  );
$$;

-- =========================================================================
-- 4. AIP LOGIC
-- =========================================================================
create type public.aip_invocation_status as enum ('pending','succeeded','failed');

create table public.aip_functions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_name text not null,
  display_name text not null,
  description text,
  model text not null default 'google/gemini-2.5-flash',
  system_prompt text not null,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, api_name)
);

create table public.aip_function_invocations (
  id uuid primary key default gen_random_uuid(),
  aip_function_id uuid not null references public.aip_functions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  input jsonb not null,
  output jsonb,
  model text,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  status public.aip_invocation_status not null default 'pending',
  error text,
  invoked_by uuid,
  invoked_at timestamptz not null default now()
);
create index aip_inv_fn_idx on public.aip_function_invocations(aip_function_id, invoked_at desc);
create index aip_inv_org_idx on public.aip_function_invocations(organization_id, invoked_at desc);

alter table public.aip_functions enable row level security;
alter table public.aip_function_invocations enable row level security;

create policy "Org members read aip_functions" on public.aip_functions for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage aip_functions" on public.aip_functions for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read aip_invocations" on public.aip_function_invocations for select to authenticated
  using (organization_id in (select public.current_user_orgs()));

-- =========================================================================
-- 5. ACTION FRAMEWORK
-- =========================================================================
create type public.action_request_status as enum (
  'pending_approval','approved','rejected','dispatched','failed','succeeded'
);

create table public.action_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  api_name text not null,
  display_name text not null,
  description text,
  target_object_type text not null,
  webhook_url text,
  validation_rules jsonb not null default '[]'::jsonb,
  requires_approval_rule jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, api_name)
);

create table public.action_requests (
  id uuid primary key default gen_random_uuid(),
  action_type_id uuid not null references public.action_types(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_object_id text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.action_request_status not null default 'pending_approval',
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  approver_id uuid,
  approved_at timestamptz,
  rejection_reason text,
  dispatch_response jsonb,
  dispatched_at timestamptz
);
create index ar_type_idx on public.action_requests(action_type_id, requested_at desc);
create index ar_org_idx on public.action_requests(organization_id, requested_at desc);
create index ar_status_idx on public.action_requests(organization_id, status);

alter table public.action_types enable row level security;
alter table public.action_requests enable row level security;

create policy "Org members read action_types" on public.action_types for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
create policy "Org admins manage action_types" on public.action_types for all to authenticated
  using (public.has_role(auth.uid(), organization_id, 'admin'::app_role))
  with check (public.has_role(auth.uid(), organization_id, 'admin'::app_role));

create policy "Org members read action_requests" on public.action_requests for select to authenticated
  using (organization_id in (select public.current_user_orgs()));
