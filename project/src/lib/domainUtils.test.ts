import { describe, expect, it } from 'vitest';
import {
  explorerTxUrl,
  getIntegrationAssistantId,
  getJobRuntimeState,
  integrationSupportsAssistantSuppression,
  roleCanCreateJobs,
  roleCanExport,
  roleCanManageIntegrations,
  roleCanManagePipelines,
  roleCanManageProject,
  shortHash,
} from './domainUtils';

describe('domain utils', () => {
  it('maps role permissions correctly', () => {
    expect(roleCanCreateJobs('developer')).toBe(true);
    expect(roleCanCreateJobs('viewer')).toBe(false);
    expect(roleCanExport('compliance')).toBe(true);
    expect(roleCanManageProject('admin')).toBe(true);
    expect(roleCanManageProject('auditor')).toBe(false);
    expect(roleCanManageIntegrations('developer')).toBe(true);
    expect(roleCanManagePipelines('compliance')).toBe(true);
  });

  it('keeps the Phase 2 role matrix explicit', () => {
    const matrix = {
      owner: {
        createJobs: true,
        manageProject: true,
        exportReports: true,
        manageIntegrations: true,
        managePipelines: true,
      },
      admin: {
        createJobs: true,
        manageProject: true,
        exportReports: true,
        manageIntegrations: true,
        managePipelines: true,
      },
      compliance: {
        createJobs: false,
        manageProject: false,
        exportReports: true,
        manageIntegrations: false,
        managePipelines: true,
      },
      auditor: {
        createJobs: false,
        manageProject: false,
        exportReports: false,
        manageIntegrations: false,
        managePipelines: false,
      },
      developer: {
        createJobs: true,
        manageProject: false,
        exportReports: true,
        manageIntegrations: true,
        managePipelines: true,
      },
      viewer: {
        createJobs: false,
        manageProject: false,
        exportReports: false,
        manageIntegrations: false,
        managePipelines: false,
      },
    } as const;

    for (const [role, expected] of Object.entries(matrix)) {
      expect(roleCanCreateJobs(role as never)).toBe(expected.createJobs);
      expect(roleCanManageProject(role as never)).toBe(expected.manageProject);
      expect(roleCanExport(role as never)).toBe(expected.exportReports);
      expect(roleCanManageIntegrations(role as never)).toBe(expected.manageIntegrations);
      expect(roleCanManagePipelines(role as never)).toBe(expected.managePipelines);
    }
  });

  it('formats hashes safely', () => {
    expect(shortHash('0x1234567890abcdef', 6, 4)).toBe('0x1234...cdef');
    expect(shortHash(null)).toBe('N/A');
  });

  it('builds Avalanche explorer links for anchored transactions', () => {
    expect(explorerTxUrl('0xabc', 'fuji')).toBe('https://testnet.snowtrace.io/tx/0xabc');
    expect(explorerTxUrl('0xdef', 'mainnet')).toBe('https://snowtrace.io/tx/0xdef');
    expect(explorerTxUrl(null, 'fuji')).toBeNull();
  });

  it('recognizes assistant-backed integrations and runtime state safely', () => {
    const integration = {
      provider_type: 'openai_compatible',
      metadata: {
        assistantId: 'asst_live_123',
      },
    } as const;

    expect(getIntegrationAssistantId(integration as never)).toBe('asst_live_123');
    expect(integrationSupportsAssistantSuppression(integration as never)).toBe(true);
    expect(integrationSupportsAssistantSuppression({
      provider_type: 'generic_http',
      metadata: {},
    } as never)).toBe(false);

    expect(getJobRuntimeState({
      metadata: {
        runtime: {
          percent: 40,
          message: 'Running suppression',
        },
      },
    } as never)).toEqual({
      percent: 40,
      message: 'Running suppression',
    });
  });
});
