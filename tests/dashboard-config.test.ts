import assert from 'node:assert/strict';
import test from 'node:test';

import { loadDashboardRuntimeContext } from '@ai-orchestrator/dashboard-api';
import { ConfigError } from '@ai-orchestrator/shared';

test('loadDashboardRuntimeContext rejects missing dashboard auth config', () => {
  assert.throws(
    () =>
      loadDashboardRuntimeContext({
        env: {
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadDashboardRuntimeContext rejects wildcard CORS origin', () => {
  assert.throws(
    () =>
      loadDashboardRuntimeContext({
        env: {
          TOOL_ALLOWED_WRITE_PATHS: '.',
          DASHBOARD_API_KEYS: 'reader:reader-key@dashboard.read',
          DASHBOARD_API_ALLOWED_ORIGINS: '*',
        },
      }),
    ConfigError,
  );
});

test('loadDashboardRuntimeContext applies dashboard project scope defaults', () => {
  const context = loadDashboardRuntimeContext({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      DASHBOARD_API_KEYS: 'reader:reader-key@dashboard.read',
    },
  });

  assert.deepEqual(context.config.project, {
    projectId: 'ai-orchestrator',
    projectName: 'AI Orchestrator',
    summary: 'MVP runtime state',
  });
});

test('loadDashboardRuntimeContext supports dashboard project scope overrides', () => {
  const context = loadDashboardRuntimeContext({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      DASHBOARD_API_KEYS: 'reader:reader-key@dashboard.read',
      DASHBOARD_PROJECT_ID: 'project-custom',
      DASHBOARD_PROJECT_NAME: 'Custom Project',
      DASHBOARD_PROJECT_SUMMARY: 'Custom dashboard scope',
    },
  });

  assert.deepEqual(context.config.project, {
    projectId: 'project-custom',
    projectName: 'Custom Project',
    summary: 'Custom dashboard scope',
  });
});
