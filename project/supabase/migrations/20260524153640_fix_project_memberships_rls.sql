/*
  Fix project membership RLS recursion.

  The original SELECT policy queried public.project_memberships from inside a
  policy on public.project_memberships, which makes Postgres recurse when an
  authenticated client lists workspace memberships. Reuse the existing
  SECURITY DEFINER role helper so membership visibility is checked without
  re-entering the table policy.
*/

DROP POLICY IF EXISTS "Project members can view memberships" ON public.project_memberships;
DROP POLICY IF EXISTS "Project admins can manage memberships" ON public.project_memberships;
DROP POLICY IF EXISTS "Project admins can insert memberships" ON public.project_memberships;
DROP POLICY IF EXISTS "Project admins can update memberships" ON public.project_memberships;
DROP POLICY IF EXISTS "Project admins can delete memberships" ON public.project_memberships;

CREATE POLICY "Project members can view memberships"
  ON public.project_memberships
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_project_role(
      project_id,
      ARRAY['owner', 'admin', 'compliance', 'auditor', 'developer', 'viewer']
    )
  );

CREATE POLICY "Project admins can insert memberships"
  ON public.project_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin']));

CREATE POLICY "Project admins can update memberships"
  ON public.project_memberships
  FOR UPDATE
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.has_project_role(project_id, ARRAY['owner', 'admin']));

CREATE POLICY "Project admins can delete memberships"
  ON public.project_memberships
  FOR DELETE
  TO authenticated
  USING (public.has_project_role(project_id, ARRAY['owner', 'admin']));

/*
  Phase 2 verification adds explicit failed-anchor states. Older installs may
  still have CHECK constraints that predate anchor_failed.
*/

ALTER TABLE public.unlearning_requests
  DROP CONSTRAINT IF EXISTS unlearning_requests_verification_status_check;

ALTER TABLE public.unlearning_requests
  ADD CONSTRAINT unlearning_requests_verification_status_check
  CHECK (
    verification_status IN (
      'not_verified',
      'valid',
      'hash_mismatch',
      'anchor_not_found',
      'anchor_pending',
      'anchor_confirmed',
      'anchor_failed',
      'invalid_bundle',
      'unsupported_file'
    )
  );

ALTER TABLE public.evidence_records
  DROP CONSTRAINT IF EXISTS evidence_records_verification_status_check;

ALTER TABLE public.evidence_records
  ADD CONSTRAINT evidence_records_verification_status_check
  CHECK (
    verification_status IN (
      'not_verified',
      'valid',
      'hash_mismatch',
      'anchor_not_found',
      'anchor_pending',
      'anchor_confirmed',
      'anchor_failed',
      'invalid_bundle',
      'unsupported_file'
    )
  );
