-- 1. Extend action_types
ALTER TABLE public.action_types
  ADD COLUMN IF NOT EXISTS rpc_function text,
  ADD COLUMN IF NOT EXISTS payload_schema jsonb;

-- 2. Extend ontology_alerts with resolution metadata
ALTER TABLE public.ontology_alerts
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text;

-- 3. Sample RPC: resolve an alert (SECURITY DEFINER, org+admin gated)
CREATE OR REPLACE FUNCTION public.resolve_ontology_alert(
  _alert_id uuid,
  _resolution_note text DEFAULT NULL
)
RETURNS public.ontology_alerts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _row public.ontology_alerts;
BEGIN
  SELECT organization_id INTO _org_id FROM public.ontology_alerts WHERE id = _alert_id;
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'Alert % not found', _alert_id;
  END IF;
  IF NOT public.has_role(auth.uid(), _org_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  UPDATE public.ontology_alerts
    SET resolved_at = now(),
        resolved_by = auth.uid(),
        resolution_note = _resolution_note
    WHERE id = _alert_id
    RETURNING * INTO _row;
  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_ontology_alert(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.resolve_ontology_alert(uuid, text) TO authenticated;

-- 4. Realtime
ALTER TABLE public.ontology_alerts REPLICA IDENTITY FULL;
ALTER TABLE public.action_requests REPLICA IDENTITY FULL;
ALTER TABLE public.ontology_object_links REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ontology_alerts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.action_requests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ontology_object_links;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Seed a resolve_alert action_type per existing org (idempotent)
INSERT INTO public.action_types (
  organization_id, api_name, display_name, description,
  target_object_type, rpc_function, payload_schema, validation_rules, enabled
)
SELECT
  o.id,
  'resolve_alert',
  'Resolve Alert',
  'Mark this ontology alert as resolved and record a resolution note.',
  'ontology_alert',
  'resolve_ontology_alert',
  '{"type":"object","properties":{"resolution_note":{"type":"string","title":"Resolution note","description":"Brief explanation of how this was resolved."}},"required":["resolution_note"]}'::jsonb,
  '[]'::jsonb,
  true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.action_types at
  WHERE at.organization_id = o.id AND at.api_name = 'resolve_alert'
);