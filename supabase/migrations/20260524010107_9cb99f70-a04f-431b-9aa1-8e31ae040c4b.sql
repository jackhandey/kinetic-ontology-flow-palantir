
-- Audit log for object history timeline
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  object_type text NOT NULL,
  object_id text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_object ON public.audit_log (organization_id, object_type, object_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT current_user_orgs()));

-- Trigger function for tasks
CREATE OR REPLACE FUNCTION public.audit_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _action text;
  _diff jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _action := 'created';
    _diff := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    _action := 'updated';
    _diff := jsonb_build_object(
      'before', to_jsonb(OLD),
      'after', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    _action := 'deleted';
    _diff := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_log (organization_id, object_type, object_id, actor_id, action, diff)
  VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    'task',
    COALESCE(NEW.id::text, OLD.id::text),
    auth.uid(),
    _action,
    _diff
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_tasks_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_tasks();

-- Bulk action RPCs
CREATE OR REPLACE FUNCTION public.bulk_set_task_status(_ids uuid[], _status text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF _status NOT IN ('open','in_progress','complete','blocked') THEN
    RAISE EXCEPTION 'Invalid status %', _status;
  END IF;
  UPDATE public.tasks
    SET status = _status,
        completed_at = CASE WHEN _status = 'complete' THEN now() ELSE completed_at END,
        updated_at = now()
    WHERE id = ANY(_ids)
      AND organization_id IN (SELECT current_user_orgs());
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;
