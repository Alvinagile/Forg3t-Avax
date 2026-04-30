/*
  # Avalanche Build Games production milestone schema

  1. New tables
    - `projects`
    - `project_memberships`
    - `integrations`
    - `integration_secrets`
    - `verification_pipelines`
    - `pipeline_runs`
    - `evidence_records`
    - `evidence_anchors`
    - `report_exports`

  2. Existing table upgrades
    - Expand `unlearning_requests` into the primary job record
    - Backfill personal workspaces for existing users
    - Prepare RLS for shared project access and RBAC

  3. Security
    - Project-scoped row level security for jobs, evidence, anchors, pipelines, exports, and integrations
    - Service-role only access to encrypted integration secrets
    - Public verification tokens without exposing tenant-private data
*/

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.slugify_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'compliance', 'auditor', 'developer', 'viewer')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('openai_compatible', 'generic_http')),
  base_url text NOT NULL,
  model_identifier text,
  auth_type text NOT NULL DEFAULT 'bearer' CHECK (auth_type IN ('bearer', 'header', 'none')),
  auth_header_name text,
  status text NOT NULL DEFAULT 'not_tested' CHECK (status IN ('not_tested', 'connected', 'failed')),
  last_tested_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  integration_id uuid PRIMARY KEY REFERENCES public.integrations(id) ON DELETE CASCADE,
  secret_ciphertext text NOT NULL,
  iv text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.verification_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  target_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  anchor_required boolean NOT NULL DEFAULT true,
  export_required boolean NOT NULL DEFAULT true,
  trigger_mode text NOT NULL DEFAULT 'manual' CHECK (trigger_mode IN ('manual', 'scheduled')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.verification_pipelines(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_jobs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_anchors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_reports jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.unlearning_requests
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.verification_pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_run_id uuid REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_type text DEFAULT 'assistant' CHECK (target_type IN ('assistant', 'document', 'model', 'api_endpoint', 'dataset', 'custom')),
  ADD COLUMN IF NOT EXISTS execution_lane text DEFAULT 'assistant_black_box' CHECK (execution_lane IN ('manual', 'assistant_black_box', 'white_box', 'api_endpoint', 'pipeline')),
  ADD COLUMN IF NOT EXISTS validation_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS target_scope_summary text,
  ADD COLUMN IF NOT EXISTS evidence_status text DEFAULT 'not_generated' CHECK (evidence_status IN ('not_generated', 'ready', 'invalid')),
  ADD COLUMN IF NOT EXISTS anchor_status text DEFAULT 'not_submitted' CHECK (anchor_status IN ('not_submitted', 'pending', 'confirmed', 'failed')),
  ADD COLUMN IF NOT EXISTS report_status text DEFAULT 'not_generated' CHECK (report_status IN ('not_generated', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'not_verified' CHECK (verification_status IN ('not_verified', 'valid', 'hash_mismatch', 'anchor_not_found', 'anchor_pending', 'anchor_confirmed', 'invalid_bundle', 'unsupported_file')),
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.evidence_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.unlearning_requests(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.verification_pipelines(id) ON DELETE SET NULL,
  pipeline_run_id uuid REFERENCES public.pipeline_runs(id) ON DELETE SET NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash text,
  job_hash text NOT NULL,
  bundle_hash text,
  report_hash text,
  artifact_status text NOT NULL DEFAULT 'not_generated' CHECK (artifact_status IN ('not_generated', 'ready', 'invalid')),
  report_status text NOT NULL DEFAULT 'not_generated' CHECK (report_status IN ('not_generated', 'ready', 'failed')),
  verification_status text NOT NULL DEFAULT 'not_verified' CHECK (verification_status IN ('not_verified', 'valid', 'hash_mismatch', 'anchor_not_found', 'anchor_pending', 'anchor_confirmed', 'invalid_bundle', 'unsupported_file')),
  public_verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id),
  UNIQUE (public_verification_token)
);

CREATE TABLE IF NOT EXISTS public.evidence_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.unlearning_requests(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL UNIQUE REFERENCES public.evidence_records(id) ON DELETE CASCADE,
  evidence_hash text NOT NULL,
  job_hash text NOT NULL,
  bundle_hash text,
  network text NOT NULL CHECK (network IN ('fuji', 'mainnet')),
  chain_id integer NOT NULL,
  contract_address text,
  transaction_hash text,
  block_number bigint,
  status text NOT NULL DEFAULT 'not_submitted' CHECK (status IN ('not_submitted', 'pending', 'confirmed', 'failed')),
  error_message text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.unlearning_requests(id) ON DELETE SET NULL,
  evidence_id uuid REFERENCES public.evidence_records(id) ON DELETE SET NULL,
  format text NOT NULL CHECK (format IN ('json', 'csv', 'pdf')),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN ('generated', 'failed')),
  download_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  generated_by uuid NOT NULL REFERENCES auth.users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_memberships_user_id ON public.project_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_project_id ON public.integrations(project_id);
CREATE INDEX IF NOT EXISTS idx_verification_pipelines_project_id ON public.verification_pipelines(project_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_pipeline_id ON public.pipeline_runs(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project_id ON public.pipeline_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_unlearning_requests_project_id ON public.unlearning_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_unlearning_requests_status ON public.unlearning_requests(status);
CREATE INDEX IF NOT EXISTS idx_unlearning_requests_execution_lane ON public.unlearning_requests(execution_lane);
CREATE INDEX IF NOT EXISTS idx_unlearning_requests_anchor_status ON public.unlearning_requests(anchor_status);
CREATE INDEX IF NOT EXISTS idx_evidence_records_project_id ON public.evidence_records(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_job_id ON public.evidence_records(job_id);
CREATE INDEX IF NOT EXISTS idx_evidence_records_evidence_hash ON public.evidence_records(evidence_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_records_report_hash ON public.evidence_records(report_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_anchors_project_id ON public.evidence_anchors(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_anchors_evidence_id ON public.evidence_anchors(evidence_id);
CREATE INDEX IF NOT EXISTS idx_evidence_anchors_transaction_hash ON public.evidence_anchors(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_report_exports_project_id ON public.report_exports(project_id);
CREATE INDEX IF NOT EXISTS idx_report_exports_evidence_id ON public.report_exports(evidence_id);

CREATE OR REPLACE FUNCTION public.create_default_project_for_user(user_uuid uuid, user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_project_id uuid;
  created_project_id uuid;
  base_name text;
  base_slug text;
BEGIN
  SELECT pm.project_id
  INTO existing_project_id
  FROM public.project_memberships pm
  WHERE pm.user_id = user_uuid
    AND pm.role = 'owner'
  ORDER BY pm.created_at ASC
  LIMIT 1;

  IF existing_project_id IS NOT NULL THEN
    RETURN existing_project_id;
  END IF;

  base_name := COALESCE(NULLIF(initcap(split_part(COALESCE(user_email, ''), '@', 1)), ''), 'Workspace') || ' Workspace';
  base_slug := COALESCE(NULLIF(public.slugify_text(split_part(COALESCE(user_email, ''), '@', 1)), ''), 'workspace') || '-' || substr(user_uuid::text, 1, 8);

  INSERT INTO public.projects (name, slug, created_by)
  VALUES (base_name, base_slug, user_uuid)
  RETURNING id INTO created_project_id;

  INSERT INTO public.project_memberships (project_id, user_id, role, created_by)
  VALUES (created_project_id, user_uuid, 'owner', user_uuid)
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = now();

  RETURN created_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.project_role(project_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.role
  FROM public.project_memberships pm
  WHERE pm.project_id = project_uuid
    AND pm.user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_project_role(project_uuid uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_memberships pm
    WHERE pm.project_id = project_uuid
      AND pm.user_id = auth.uid()
      AND pm.role = ANY (allowed_roles)
  );
$$;

REVOKE ALL ON FUNCTION public.project_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_project_role(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.project_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, package_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'package_type', 'individual')
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();

  PERFORM public.create_default_project_for_user(NEW.id, NEW.email);

  RETURN NEW;
EXCEPTION
  WHEN others THEN
    RAISE WARNING 'Failed to create user profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
  existing_user record;
BEGIN
  FOR existing_user IN
    SELECT id, email
    FROM public.users
  LOOP
    PERFORM public.create_default_project_for_user(existing_user.id, existing_user.email);
  END LOOP;
END $$;

UPDATE public.unlearning_requests ur
SET
  project_id = owner_memberships.project_id,
  created_by = COALESCE(ur.created_by, ur.user_id),
  target_scope_summary = COALESCE(ur.target_scope_summary, left(COALESCE(ur.request_reason, ''), 240)),
  completed_at = CASE
    WHEN ur.status = 'completed' AND ur.completed_at IS NULL THEN COALESCE(ur.updated_at, ur.created_at)
    ELSE ur.completed_at
  END,
  anchor_status = CASE
    WHEN ur.anchor_status IS NULL OR ur.anchor_status = 'not_submitted' THEN
      CASE WHEN ur.blockchain_tx_hash IS NULL THEN 'not_submitted' ELSE 'pending' END
    ELSE ur.anchor_status
  END,
  evidence_status = COALESCE(ur.evidence_status, CASE WHEN ur.audit_trail IS NULL THEN 'not_generated' ELSE 'ready' END),
  report_status = COALESCE(ur.report_status, 'not_generated'),
  verification_status = COALESCE(ur.verification_status, 'not_verified')
FROM (
  SELECT DISTINCT ON (pm.user_id)
    pm.user_id,
    pm.project_id
  FROM public.project_memberships pm
  WHERE pm.role = 'owner'
  ORDER BY pm.user_id, pm.created_at ASC
) owner_memberships
WHERE owner_memberships.user_id = ur.user_id
  AND ur.project_id IS NULL;

ALTER TABLE public.unlearning_requests
  ALTER COLUMN project_id SET NOT NULL,
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view relevant profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM public.project_memberships own_membership
      JOIN public.project_memberships related_membership
        ON related_membership.project_id = own_membership.project_id
      WHERE own_membership.user_id = auth.uid()
        AND related_membership.user_id = users.id
    )
  );

CREATE POLICY "Project members can view projects"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create projects"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Project admins can update projects"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.has_project_role(id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_project_role(id, ARRAY['owner', 'admin']));

CREATE POLICY "Project owners can delete projects"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (public.has_project_role(id, ARRAY['owner']));

CREATE POLICY "Service role can manage projects"
  ON public.projects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view memberships"
  ON public.project_memberships
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = project_memberships.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project admins can manage memberships"
  ON public.project_memberships
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin']));

CREATE POLICY "Service role can manage memberships"
  ON public.project_memberships
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view their own unlearning requests" ON public.unlearning_requests;
DROP POLICY IF EXISTS "Users can insert their own unlearning requests" ON public.unlearning_requests;
DROP POLICY IF EXISTS "Users can update their own unlearning requests" ON public.unlearning_requests;

CREATE POLICY "Project members can view unlearning requests"
  ON public.unlearning_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = unlearning_requests.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project builders can insert unlearning requests"
  ON public.unlearning_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer'])
  );

CREATE POLICY "Project operators can update unlearning requests"
  ON public.unlearning_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage unlearning requests"
  ON public.unlearning_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view integrations"
  ON public.integrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = integrations.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project technical users can manage integrations"
  ON public.integrations
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer']));

CREATE POLICY "Service role can manage integrations"
  ON public.integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage integration secrets"
  ON public.integration_secrets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view pipelines"
  ON public.verification_pipelines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = verification_pipelines.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project operators can manage pipelines"
  ON public.verification_pipelines
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage pipelines"
  ON public.verification_pipelines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view pipeline runs"
  ON public.pipeline_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = pipeline_runs.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project operators can manage pipeline runs"
  ON public.pipeline_runs
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage pipeline runs"
  ON public.pipeline_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view evidence records"
  ON public.evidence_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = evidence_records.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project operators can manage evidence records"
  ON public.evidence_records
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage evidence records"
  ON public.evidence_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view evidence anchors"
  ON public.evidence_anchors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = evidence_anchors.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project compliance users can manage evidence anchors"
  ON public.evidence_anchors
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage evidence anchors"
  ON public.evidence_anchors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Project members can view report exports"
  ON public.report_exports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_memberships pm
      WHERE pm.project_id = report_exports.project_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Project report users can manage exports"
  ON public.report_exports
  FOR ALL
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin', 'developer', 'compliance']));

CREATE POLICY "Service role can manage report exports"
  ON public.report_exports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_memberships_updated_at ON public.project_memberships;
CREATE TRIGGER update_project_memberships_updated_at
  BEFORE UPDATE ON public.project_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_integrations_updated_at ON public.integrations;
CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_integration_secrets_updated_at ON public.integration_secrets;
CREATE TRIGGER update_integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_verification_pipelines_updated_at ON public.verification_pipelines;
CREATE TRIGGER update_verification_pipelines_updated_at
  BEFORE UPDATE ON public.verification_pipelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_pipeline_runs_updated_at ON public.pipeline_runs;
CREATE TRIGGER update_pipeline_runs_updated_at
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_evidence_records_updated_at ON public.evidence_records;
CREATE TRIGGER update_evidence_records_updated_at
  BEFORE UPDATE ON public.evidence_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_evidence_anchors_updated_at ON public.evidence_anchors;
CREATE TRIGGER update_evidence_anchors_updated_at
  BEFORE UPDATE ON public.evidence_anchors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_report_exports_updated_at ON public.report_exports;
CREATE TRIGGER update_report_exports_updated_at
  BEFORE UPDATE ON public.report_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
