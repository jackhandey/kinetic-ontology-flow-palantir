
-- Tasks table
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'medium',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read tasks" ON public.tasks
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT current_user_orgs()));

CREATE POLICY "Org members insert tasks" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT current_user_orgs()));

CREATE POLICY "Org admins manage tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

-- RPC: mark task complete. Uses _alert_id param name for compatibility with
-- the generic action-framework dispatcher (passes target id as _alert_id).
CREATE OR REPLACE FUNCTION public.mark_task_complete(_alert_id text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.tasks;
  _org uuid;
BEGIN
  SELECT organization_id INTO _org FROM public.tasks WHERE id = _alert_id::uuid;
  IF _org IS NULL THEN RAISE EXCEPTION 'Task % not found', _alert_id; END IF;
  IF NOT (_org IN (SELECT current_user_orgs())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.tasks
    SET status = 'complete', completed_at = now(), updated_at = now()
    WHERE id = _alert_id::uuid
    RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- RPC: set priority
CREATE OR REPLACE FUNCTION public.set_task_priority(_alert_id text, _level text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.tasks;
  _org uuid;
BEGIN
  IF _level NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'Invalid level %', _level;
  END IF;
  SELECT organization_id INTO _org FROM public.tasks WHERE id = _alert_id::uuid;
  IF _org IS NULL THEN RAISE EXCEPTION 'Task % not found', _alert_id; END IF;
  IF NOT (_org IN (SELECT current_user_orgs())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.tasks
    SET priority = _level, updated_at = now()
    WHERE id = _alert_id::uuid
    RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- Seed Task object type + actions for every org
DO $$
DECLARE _org uuid;
BEGIN
  FOR _org IN SELECT id FROM public.organizations LOOP
    INSERT INTO public.ontology_object_types
      (organization_id, api_name, display_name, description, icon, primary_key_field, title_field)
    VALUES (_org, 'task', 'Task', 'Actionable work item', 'check-square', 'id', 'title')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.action_types
      (organization_id, api_name, display_name, description, target_object_type,
       rpc_function, payload_schema, validation_rules, enabled)
    VALUES
      (_org, 'mark_task_complete', 'Mark as Complete', 'Mark this task as done',
       'task', 'mark_task_complete', NULL, '[]'::jsonb, true),
      (_org, 'set_task_priority', 'Set Priority', 'Update priority level',
       'task', 'set_task_priority',
       jsonb_build_object(
         'type','object',
         'properties', jsonb_build_object(
           'level', jsonb_build_object(
             'type','string','title','Priority Level',
             'enum', jsonb_build_array('low','medium','high','critical')
           )
         ),
         'required', jsonb_build_array('level')
       ),
       '[{"field":"level","op":"required"}]'::jsonb, true)
    ON CONFLICT DO NOTHING;

    -- Seed a few example tasks
    INSERT INTO public.tasks (organization_id, title, description, priority)
    VALUES
      (_org, 'Review Q4 risk report', 'Triage outstanding ontology alerts', 'high'),
      (_org, 'Reconcile inventory batches', 'Cross-check raw vs processed manifests', 'medium'),
      (_org, 'Onboard new fleet operator', NULL, 'low')
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
