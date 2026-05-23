REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_bootstrap() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_user_orgs() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_marking(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_orgs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_marking(uuid, uuid) TO authenticated;