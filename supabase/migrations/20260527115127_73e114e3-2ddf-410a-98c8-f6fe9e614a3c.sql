-- 1. Drop overly permissive realtime policy if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Authenticated can receive realtime'
  ) THEN
    EXECUTE 'DROP POLICY "Authenticated can receive realtime" ON realtime.messages';
  END IF;
END $$;

-- 2. Tighten action_requests INSERT: non-admins must use pending_approval
DROP POLICY IF EXISTS "Org members insert action_requests" ON public.action_requests;
CREATE POLICY "Org members insert action_requests"
ON public.action_requests
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (SELECT current_user_orgs())
  AND requested_by = auth.uid()
  AND (
    status = 'pending_approval'::action_request_status
    OR has_role(auth.uid(), organization_id, 'admin'::app_role)
  )
);

-- 3. Restrictive write-deny policies on raw_* ingestion tables.
-- Restrictive policies AND with permissive policies, so org members
-- (who have no permissive INSERT/UPDATE/DELETE) are blocked entirely.
-- service_role bypasses RLS so server ingestion jobs are unaffected.
DO $$
DECLARE
  t text;
  raw_tables text[] := ARRAY[
    'raw_asset_status','raw_driver_logs','raw_fleet_status','raw_freight_orders',
    'raw_inventory_batches','raw_route_plans','raw_shipping_manifests',
    'raw_telemetry_logs','raw_tickets','raw_traffic_incidents','raw_transactions',
    'raw_weather_conditions'
  ];
BEGIN
  FOREACH t IN ARRAY raw_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Deny writes for org members" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Deny writes for org members" ON public.%I
       AS RESTRICTIVE FOR ALL TO authenticated
       USING (false) WITH CHECK (false)', t);
  END LOOP;
END $$;