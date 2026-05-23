
create or replace function public.handle_new_user_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  -- Derive a sensible default org name from metadata or email local-part
  org_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'organization_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(new.email, '@', 1),
    'My Organization'
  ) || '''s Workspace';

  insert into public.organizations (name)
  values (org_name)
  returning id into new_org_id;

  insert into public.user_roles (user_id, organization_id, role)
  values (new.id, new_org_id, 'admin');

  return new;
end;
$$;

revoke execute on function public.handle_new_user_bootstrap() from public, anon, authenticated;

create trigger on_auth_user_created_bootstrap
  after insert on auth.users
  for each row execute function public.handle_new_user_bootstrap();
