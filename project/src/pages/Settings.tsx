import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, UserPlus, Wifi } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { integrationsApi, projectAccessApi } from '../lib/api';
import { getIntegrationAssistantId, roleCanManageIntegrations, roleCanManageProject } from '../lib/domainUtils';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../hooks/useWorkspace';
import { StatusBadge } from '../components/StatusBadge';
import type { Integration, ProjectMembershipRecord, ProjectRole } from '../types/domain';

const allRoles: ProjectRole[] = ['owner', 'admin', 'compliance', 'auditor', 'developer', 'viewer'];

export function Settings() {
  const { user } = useAuth();
  const { activeMembership, refresh: refreshWorkspace } = useWorkspace();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [memberships, setMemberships] = useState<ProjectMembershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [integrationForm, setIntegrationForm] = useState({
    name: '',
    providerType: 'openai_compatible',
    baseUrl: '',
    modelIdentifier: '',
    assistantId: '',
    authType: 'bearer',
    authHeaderName: 'x-api-key',
    secret: '',
    healthcheckPath: '',
  });
  const [editingIntegrationId, setEditingIntegrationId] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ProjectRole>('viewer');

  const canManageProject = roleCanManageProject(activeMembership?.role);
  const canManageIntegrations = roleCanManageIntegrations(activeMembership?.role);

  const loadWorkspaceSettings = async () => {
    if (!activeMembership?.project_id) {
      setIntegrations([]);
      setMemberships([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [integrationResponse, membershipResponse] = await Promise.all([
        integrationsApi.list(activeMembership.project_id),
        projectAccessApi.list(activeMembership.project_id),
      ]);
      setIntegrations(integrationResponse.integrations);
      setMemberships(membershipResponse.memberships);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load workspace settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspaceSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembership?.project_id]);

  const activeProjectName = useMemo(() => activeMembership?.projects.name ?? 'Workspace', [activeMembership?.projects.name]);

  const updateEmail = async () => {
    setMessage('');
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ email });
      if (updateError) {
        throw updateError;
      }
      setMessage('Email update request submitted. Please confirm the new address from your inbox.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update email');
    }
  };

  const updatePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setMessage('');
    setError('');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        throw updateError;
      }
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Password updated successfully.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update password');
    }
  };

  const resetIntegrationForm = () => {
    setEditingIntegrationId(null);
    setIntegrationForm({
      name: '',
      providerType: 'openai_compatible',
      baseUrl: '',
      modelIdentifier: '',
      assistantId: '',
      authType: 'bearer',
      authHeaderName: 'x-api-key',
      secret: '',
      healthcheckPath: '',
    });
  };

  const saveIntegration = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    setError('');
    setMessage('');
    try {
      const payload = {
        projectId: activeMembership.project_id,
        name: integrationForm.name,
        providerType: integrationForm.providerType,
        baseUrl: integrationForm.baseUrl,
        modelIdentifier: integrationForm.modelIdentifier,
        authType: integrationForm.authType,
        authHeaderName: integrationForm.authHeaderName,
        secret: integrationForm.secret,
        metadata: {
          healthcheckPath: integrationForm.healthcheckPath,
          assistantId: integrationForm.assistantId,
        },
      };

      if (editingIntegrationId) {
        await integrationsApi.update({
          integrationId: editingIntegrationId,
          ...payload,
        });
      } else {
        await integrationsApi.create(payload);
      }

      resetIntegrationForm();
      setMessage(editingIntegrationId ? 'Integration updated.' : 'Integration created.');
      await loadWorkspaceSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to save integration');
    }
  };

  const testIntegration = async (integrationId: string) => {
    setError('');
    setMessage('');
    try {
      await integrationsApi.test(integrationId);
      setMessage('Integration test completed.');
      await loadWorkspaceSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to test integration');
    }
  };

  const addMember = async () => {
    if (!activeMembership?.project_id) {
      return;
    }

    setError('');
    setMessage('');
    try {
      await projectAccessApi.add({
        projectId: activeMembership.project_id,
        email: memberEmail,
        role: memberRole,
      });
      setMemberEmail('');
      setMemberRole('viewer');
      setMessage('Project member added.');
      await refreshWorkspace();
      await loadWorkspaceSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to add project member');
    }
  };

  const updateMembershipRole = async (membershipId: string, role: ProjectRole) => {
    setError('');
    setMessage('');
    try {
      await projectAccessApi.update({ membershipId, role });
      setMessage('Project role updated.');
      await loadWorkspaceSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to update role');
    }
  };

  const removeMembership = async (membershipId: string) => {
    setError('');
    setMessage('');
    try {
      await projectAccessApi.remove(membershipId);
      setMessage('Project member removed.');
      await refreshWorkspace();
      await loadWorkspaceSettings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to remove member');
    }
  };

  const editIntegration = (integration: Integration) => {
    const metadata = integration.metadata ?? {};
    setEditingIntegrationId(integration.id);
    setIntegrationForm({
      name: integration.name,
      providerType: integration.provider_type,
      baseUrl: integration.base_url,
      modelIdentifier: integration.model_identifier ?? '',
      assistantId: getIntegrationAssistantId(integration) ?? '',
      authType: integration.auth_type,
      authHeaderName: integration.auth_header_name ?? 'x-api-key',
      secret: '',
      healthcheckPath: typeof metadata.healthcheckPath === 'string' ? metadata.healthcheckPath : '',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#111111]">Settings</h1>
          <p className="mt-2 text-[#4B4B4B]">
            Manage profile, workspace access, and integration connectivity for {activeProjectName}.
          </p>
        </div>
        <button
          type="button"
          onClick={loadWorkspaceSettings}
          className="inline-flex items-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-[#111111]">Profile</h2>
            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={updateEmail}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
              >
                Update email
              </button>
            </div>
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Confirm password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={updatePassword}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
              >
                Update password
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#111111]">Project Access</h2>
                <p className="text-sm text-[#4B4B4B]">Manage owners, admins, auditors, compliance, and viewers.</p>
              </div>
            </div>
            {canManageProject && (
              <div className="mt-6 grid gap-3 md:grid-cols-[1fr,180px,auto]">
                <input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  placeholder="member@company.com"
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
                <select
                  value={memberRole}
                  onChange={(event) => setMemberRole(event.target.value as ProjectRole)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  {allRoles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addMember}
                  className="rounded-xl bg-[#2F80ED] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2870CE]"
                >
                  Add member
                </button>
              </div>
            )}
            <div className="mt-6 space-y-3">
              {loading ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                  Loading members...
                </div>
              ) : memberships.map((membership) => (
                <div key={membership.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="font-semibold text-[#111111]">{membership.users.email}</div>
                      <div className="mt-1 text-sm text-[#4B4B4B]">{membership.users.package_type} plan</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {canManageProject ? (
                        <select
                          value={membership.role}
                          onChange={(event) => void updateMembershipRole(membership.id, event.target.value as ProjectRole)}
                          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                        >
                          {allRoles.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge status={membership.role} />
                      )}
                      {canManageProject && membership.role !== 'owner' && (
                        <button
                          type="button"
                          onClick={() => void removeMembership(membership.id)}
                          className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-[#F2F7FF] p-3 text-[#2F80ED]">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#111111]">Integrations</h2>
              <p className="text-sm text-[#4B4B4B]">Configure OpenAI-compatible or generic HTTP model endpoints, including assistant-backed black-box suppression.</p>
            </div>
          </div>

          {canManageIntegrations && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Name</span>
                <input
                  value={integrationForm.name}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Provider</span>
                <select
                  value={integrationForm.providerType}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, providerType: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  <option value="openai_compatible">openai_compatible</option>
                  <option value="generic_http">generic_http</option>
                </select>
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Base URL</span>
                <input
                  value={integrationForm.baseUrl}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, baseUrl: event.target.value }))}
                  placeholder="https://api.example.com"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Model Identifier</span>
                <input
                  value={integrationForm.modelIdentifier}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, modelIdentifier: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              {integrationForm.providerType === 'openai_compatible' && (
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Assistant ID (optional)</span>
                  <input
                    value={integrationForm.assistantId}
                    onChange={(event) => setIntegrationForm((current) => ({ ...current, assistantId: event.target.value }))}
                    placeholder="asst_..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                  />
                </label>
              )}
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Auth Type</span>
                <select
                  value={integrationForm.authType}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, authType: event.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                >
                  <option value="bearer">bearer</option>
                  <option value="header">header</option>
                  <option value="none">none</option>
                </select>
              </label>
              {integrationForm.authType === 'header' && (
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Header Name</span>
                  <input
                    value={integrationForm.authHeaderName}
                    onChange={(event) => setIntegrationForm((current) => ({ ...current, authHeaderName: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                  />
                </label>
              )}
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Secret</span>
                <input
                  type="password"
                  value={integrationForm.secret}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, secret: event.target.value }))}
                  placeholder="API key or shared secret"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <label className="md:col-span-2">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">Healthcheck Path (optional)</span>
                <input
                  value={integrationForm.healthcheckPath}
                  onChange={(event) => setIntegrationForm((current) => ({ ...current, healthcheckPath: event.target.value }))}
                  placeholder="/health"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#111111] focus:border-[#2F80ED] focus:outline-none"
                />
              </label>
              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveIntegration}
                    className="rounded-xl bg-[#2F80ED] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2870CE]"
                  >
                    {editingIntegrationId ? 'Update integration' : 'Save integration'}
                  </button>
                  {editingIntegrationId && (
                    <button
                      type="button"
                      onClick={resetIntegrationForm}
                      className="rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                Loading integrations...
              </div>
            ) : integrations.length ? integrations.map((integration) => (
              <div key={integration.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-semibold text-[#111111]">{integration.name}</div>
                    <div className="mt-1 text-sm text-[#4B4B4B]">
                      {integration.provider_type.replaceAll('_', ' ')} · {integration.base_url}
                    </div>
                    {getIntegrationAssistantId(integration) && (
                      <div className="mt-1 text-sm text-[#4B4B4B]">
                        Assistant ID: {getIntegrationAssistantId(integration)}
                      </div>
                    )}
                    {integration.last_error && (
                      <div className="mt-2 text-sm text-red-700">{integration.last_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={integration.status} />
                    {canManageIntegrations && (
                      <>
                        <button
                          type="button"
                          onClick={() => editIntegration(integration)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void testIntegration(integration.id)}
                          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-[#111111] hover:border-[#2F80ED] hover:text-[#2F80ED]"
                        >
                          Test
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-[#4B4B4B]">
                No integrations configured yet.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
