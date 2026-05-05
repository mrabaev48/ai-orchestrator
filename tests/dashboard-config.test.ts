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
