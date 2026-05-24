
DO $$ BEGIN
  CREATE TYPE public.schema_proposal_status AS ENUM ('pending','promoted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.schema_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  proposed_by uuid,
  source text NOT NULL,
  title text NOT NULL,
  rationale text,
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.schema_proposal_status NOT NULL DEFAULT 'pending',
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schema_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read schema_proposals"
  ON public.schema_proposals FOR SELECT TO authenticated
  USING (organization_id IN (SELECT current_user_orgs()));

CREATE POLICY "Org members insert schema_proposals"
  ON public.schema_proposals FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT current_user_orgs()));

CREATE POLICY "Org admins manage schema_proposals"
  ON public.schema_proposals FOR ALL TO authenticated
  USING (has_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), organization_id, 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.schema_proposals;
