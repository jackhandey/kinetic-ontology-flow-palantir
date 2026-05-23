
revoke execute on function public.has_role(uuid, uuid, public.app_role) from public, anon;
revoke execute on function public.current_user_orgs() from public, anon;
grant execute on function public.has_role(uuid, uuid, public.app_role) to authenticated;
grant execute on function public.current_user_orgs() to authenticated;
