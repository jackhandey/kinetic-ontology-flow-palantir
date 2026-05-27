-- 1. Lock down pipeline_runs writes to admins only
CREATE POLICY "Org admins manage pipeline_runs"
ON public.pipeline_runs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

-- 2. Scope realtime subscriptions by org. Topic convention: "org:<organization_id>[:...]"
-- Drop any existing permissive policy and replace it.
DROP POLICY IF EXISTS "Authenticated users can receive broadcasts" ON realtime.messages;
DROP POLICY IF EXISTS "Allow authenticated access to realtime" ON realtime.messages;
DROP POLICY IF EXISTS "authenticated can read messages" ON realtime.messages;

CREATE POLICY "Org members access own org realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  split_part(realtime.topic(), ':', 1) = 'org'
  AND split_part(realtime.topic(), ':', 2) IN (
    SELECT organization_id::text FROM public.user_roles WHERE user_id = auth.uid()
  )
);