import assert from 'node:assert/strict';
import test from 'node:test';

import { Test } from '@nestjs/testing';

import { createDashboardApiRootModule } from '../apps/dashboard-api/src/dashboard-api.module.ts';
import { DashboardQueryService } from '../packages/application/src/index.ts';
import type { DashboardApiConfig } from '../apps/dashboard-api/src/config/dashboard-config.ts';

test('DashboardApiModule wires DashboardQueryService provider', async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [createDashboardApiRootModule({
      host: '127.0.0.1',
      port: 0,
      runtime: {
        llm: {
          provider: 'mock',
          model: 'mock-model',
          temperature: 0.2,
          timeoutMs: 1000,
        },
        state: {
          backend: 'memory',
          postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      sqlitePath: '/tmp/unused.db',
          snapshotOnBootstrap: true,
          snapshotOnTaskCompletion: true,
          snapshotOnMilestoneCompletion: true,
        },
        workflow: {
          maxStepsPerRun: 5,
          maxRetriesPerTask: 2,
        },
        tools: {
          allowedWritePaths: [process.cwd()],
          typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
        },
        logging: {
          level: 'error',
          format: 'json',
        },
      },
      security: {
        apiKeys: [{ id: 'test', key: 'test-key', roles: ['dashboard.read'] }],
      },
      cors: {
        allowedOrigins: [],
      },
    } satisfies DashboardApiConfig)],
  }).compile();

  const queryService = moduleRef.get(DashboardQueryService);

  assert.ok(queryService instanceof DashboardQueryService);

  await moduleRef.close();
});
