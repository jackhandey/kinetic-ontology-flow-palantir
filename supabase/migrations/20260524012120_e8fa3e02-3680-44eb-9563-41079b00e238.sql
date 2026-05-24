-- 1. action_requests: org member insert + admin manage
CREATE POLICY "Org members insert action_requests"
ON public.action_requests FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT current_user_orgs())
  AND requested_by = auth.uid()
);

CREATE POLICY "Org admins manage action_requests"
ON public.action_requests FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

-- 2. aip_function_invocations: insert scoped to caller's org
CREATE POLICY "Org members insert aip_invocations"
ON public.aip_function_invocations FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT current_user_orgs())
  AND (invoked_by = auth.uid() OR invoked_by IS NULL)
);

-- 3. ontology_object_links: admin manage
CREATE POLICY "Org admins manage object_links"
ON public.ontology_object_links FOR ALL TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

-- 4. Realtime: require authenticated subscribers. Row-level filtering
--    continues to happen via each table's RLS SELECT policy.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can receive realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (true);

-- 5. Revoke public/anon execute on SECURITY DEFINER functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_user_orgs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_marking(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_task_complete(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_task_priority(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_ontology_alert(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bulk_set_task_status(uuid[], text) FROM PUBLIC, anon;
