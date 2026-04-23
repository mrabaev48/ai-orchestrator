import assert from 'node:assert/strict';
import test from 'node:test';

import { HealthCheckService } from '@nestjs/terminus';

import { DashboardReadApiService } from '../apps/dashboard-api/src/dashboard-query/dashboard-query.service.ts';
import { DashboardQueryController } from '../apps/dashboard-api/src/dashboard-query/dashboard-query.controller.ts';
import { HealthController } from '../apps/dashboard-api/src/health/health.controller.ts';
import { DashboardReadinessService } from '../apps/dashboard-api/src/health/health.service.ts';
import { createDashboardApiApp } from '../apps/dashboard-api/src/bootstrap.ts';
import type { DashboardRuntimeContext } from '../apps/dashboard-api/src/config/dashboard-config.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';

function makeRuntimeConfig(): RuntimeConfig {
  return {
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
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('dashboard api health endpoints expose liveness and readiness', async () => {
  const runtimeConfig = makeRuntimeConfig();
  const runtimeContext: DashboardRuntimeContext = {
    config: {
      host: '127.0.0.1',
      port: 0,
      runtime: runtimeConfig,
      security: {
        apiKeys: [{ id: 'test', key: 'test-key', roles: ['dashboard.read'] }],
      },
      cors: {
        allowedOrigins: [],
      },
    },
    logger: createLogger(runtimeConfig, { sink: () => {} }),
  };
  const app = await createDashboardApiApp(runtimeContext);

  await app.init();

  try {
    const healthController = new HealthController(
      app.get(HealthCheckService),
      app.get(DashboardReadinessService),
    );
    const queryController = new DashboardQueryController(app.get(DashboardReadApiService));
    const liveness = healthController.getLiveness();
    const readiness = await healthController.getReadiness();
    const summary = await queryController.getStateSummary();

    assert.equal(liveness.status, 'ok');
    assert.equal(readiness.status, 'ok');
    assert.equal(summary.projectName, 'Dashboard API');
  } finally {
    await app.close();
  }
});

test('dashboard api query endpoints expose read-only dashboard views', async () => {
  const runtimeConfig = makeRuntimeConfig();
  const runtimeContext: DashboardRuntimeContext = {
    config: {
      host: '127.0.0.1',
      port: 0,
      runtime: runtimeConfig,
      security: {
        apiKeys: [{ id: 'test', key: 'test-key', roles: ['dashboard.read'] }],
      },
      cors: {
        allowedOrigins: [],
      },
    },
    logger: createLogger(runtimeConfig, { sink: () => {} }),
  };
  const app = await createDashboardApiApp(runtimeContext);

  await app.init();

  try {
    const queryController = new DashboardQueryController(app.get(DashboardReadApiService));
    const state = await queryController.getStateSummary();
    const milestones = await queryController.getMilestones();
    const backlog = await queryController.getBacklog();
    const events = await queryController.getEvents({});
    const failures = await queryController.getFailures({});
    const decisions = await queryController.getDecisions({});
    const artifacts = await queryController.getArtifacts({});
    const latestRun = await queryController.getLatestRunSummary();

    assert.equal(state.projectId, 'dashboard-api');
    assert.deepEqual(milestones, []);
    assert.equal(Array.isArray(backlog.tasks), true);
    assert.equal(Array.isArray(events.items), true);
    assert.equal(Array.isArray(failures.items), true);
    assert.equal(Array.isArray(decisions.items), true);
    assert.equal(Array.isArray(artifacts.items), true);
    assert.equal(latestRun, null);
  } finally {
    await app.close();
  }
});
