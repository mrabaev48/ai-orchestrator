import assert from 'node:assert/strict';
import test from 'node:test';

import { HealthCheckService } from '@nestjs/terminus';

import { DashboardReadApiService } from '../apps/dashboard-api/src/dashboard-query/dashboard-query.service.ts';
import { DashboardQueryController } from '../apps/dashboard-api/src/dashboard-query/dashboard-query.controller.ts';
import { HealthController } from '../apps/dashboard-api/src/health/health.controller.ts';
import { DashboardReadinessService } from '../apps/dashboard-api/src/health/health.service.ts';
import { STATE_STORE } from '../apps/dashboard-api/src/dashboard-api.tokens.ts';
import { createDashboardApiApp } from '../apps/dashboard-api/src/bootstrap.ts';
import type { DashboardRuntimeContext } from '../apps/dashboard-api/src/config/dashboard-config.ts';
import { computeRunStepChecksum, type RunStepLogEntry } from '../packages/core/src/index.ts';
import type { StateStore } from '../packages/state/src/index.ts';
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
    const summary = await queryController.getStateSummary({});

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
    const state = await queryController.getStateSummary({});
    const milestones = await queryController.getMilestones({});
    const backlog = await queryController.getBacklog({});
    const events = await queryController.getEvents({});
    const failures = await queryController.getFailures({});
    const decisions = await queryController.getDecisions({});
    const artifacts = await queryController.getArtifacts({});
    const evidence = await queryController.getRunStepEvidence({});
    const latestRun = await queryController.getLatestRunSummary({});
    const readinessScorecard = await queryController.getReadinessScorecard({});

    assert.equal(state.projectId, 'dashboard-api');
    assert.deepEqual(milestones, []);
    assert.equal(Array.isArray(backlog.tasks), true);
    assert.equal(Array.isArray(events.items), true);
    assert.equal(Array.isArray(failures.items), true);
    assert.equal(Array.isArray(decisions.items), true);
    assert.equal(Array.isArray(artifacts.items), true);
    assert.equal(Array.isArray(evidence), true);
    assert.equal(latestRun, null);
    assert.equal(readinessScorecard.verdict, 'blocked');
    assert.equal(Array.isArray(readinessScorecard.criteria), true);
  } finally {
    await app.close();
  }
});


test('dashboard api evidence endpoint filters by runId/taskId deterministically', async () => {
  const runtimeConfig = makeRuntimeConfig();
  const runtimeContext: DashboardRuntimeContext = {
    config: { host: '127.0.0.1', port: 0, runtime: runtimeConfig, security: { apiKeys: [{ id: 'test', key: 'test-key', roles: ['dashboard.read'] }] }, cors: { allowedOrigins: [] } },
    logger: createLogger(runtimeConfig, { sink: () => {} }),
  };
  const app = await createDashboardApiApp(runtimeContext);
  await app.init();

  try {
    const queryController = new DashboardQueryController(app.get(DashboardReadApiService));
    const stateStore = app.get<StateStore>(STATE_STORE);

    const base = {
      tenantId: 'tenant-1', projectId: 'dashboard-api', stepId: 'step-1', attempt: 0, role: 'tester', input: 'in', output: 'out',
      status: 'succeeded' as const, idempotencyKey: 'k-1', traceId: 'trace-1', durationMs: 1, createdAt: new Date().toISOString(),
    };
    const step1: RunStepLogEntry = { id: 'ev-1', runId: 'run-a', taskId: 'task-a', ...base, checksum: '' };
    step1.checksum = computeRunStepChecksum({ evidenceId: step1.id, tenantId: step1.tenantId, projectId: step1.projectId, runId: step1.runId, stepId: step1.stepId, attempt: step1.attempt, status: step1.status, idempotencyKey: step1.idempotencyKey, createdAt: step1.createdAt, traceId: step1.traceId });
    const step2: RunStepLogEntry = { ...step1, id: 'ev-2', runId: 'run-b', taskId: 'task-b', idempotencyKey: 'k-2', createdAt: new Date(Date.now() + 1000).toISOString(), checksum: '' };
    step2.checksum = computeRunStepChecksum({ evidenceId: step2.id, tenantId: step2.tenantId, projectId: step2.projectId, runId: step2.runId, stepId: step2.stepId, attempt: step2.attempt, status: step2.status, idempotencyKey: step2.idempotencyKey, createdAt: step2.createdAt, traceId: step2.traceId });

    await stateStore.recordRunStep(step1);
    await stateStore.recordRunStep(step2);

    const byRun = await queryController.getRunStepEvidence({ runId: 'run-a' });
    const byTask = await queryController.getRunStepEvidence({ taskId: 'task-b' });

    assert.equal(byRun.length, 1);
    assert.equal(byRun[0]?.runId, 'run-a');
    assert.equal(byTask.length, 1);
    assert.equal(byTask[0]?.taskId, 'task-b');
  } finally {
    await app.close();
  }
});

test('dashboard api evidence endpoint surfaces EVIDENCE_INTEGRITY_VIOLATION for tampered chain', async () => {
  const runtimeConfig = makeRuntimeConfig();
  const runtimeContext: DashboardRuntimeContext = {
    config: { host: '127.0.0.1', port: 0, runtime: runtimeConfig, security: { apiKeys: [{ id: 'test', key: 'test-key', roles: ['dashboard.read'] }] }, cors: { allowedOrigins: [] } },
    logger: createLogger(runtimeConfig, { sink: () => {} }),
  };
  const app = await createDashboardApiApp(runtimeContext);
  await app.init();

  try {
    const queryController = new DashboardQueryController(app.get(DashboardReadApiService));
    const stateStore = app.get<StateStore>(STATE_STORE);

    const now = Date.now();
    const base = { tenantId: 'tenant-1', projectId: 'dashboard-api', runId: 'run-tampered', stepId: 'step-x', attempt: 0, taskId: 'task-x', role: 'tester', input: 'in', output: 'out', status: 'cancellation_requested' as const, idempotencyKey: 'key-1', traceId: 'run-tampered', durationMs: 1 };
    const first: RunStepLogEntry = { id: 'ev-1', ...base, createdAt: new Date(now).toISOString(), checksum: '' };
    first.checksum = computeRunStepChecksum({ evidenceId: first.id, tenantId: first.tenantId, projectId: first.projectId, runId: first.runId, stepId: first.stepId, attempt: first.attempt, status: first.status, idempotencyKey: first.idempotencyKey, createdAt: first.createdAt, traceId: first.traceId });
    await stateStore.recordRunStep(first);

    const tampered: RunStepLogEntry = { id: 'ev-2', ...base, status: 'cancelled', createdAt: new Date(now + 1000).toISOString(), prevChecksum: 'tampered', checksum: '' };
    tampered.checksum = computeRunStepChecksum({ evidenceId: tampered.id, tenantId: tampered.tenantId, projectId: tampered.projectId, runId: tampered.runId, stepId: tampered.stepId, attempt: tampered.attempt, status: tampered.status, idempotencyKey: tampered.idempotencyKey, createdAt: tampered.createdAt, ...(tampered.prevChecksum ? { prevChecksum: tampered.prevChecksum } : {}), traceId: tampered.traceId });
    await stateStore.recordRunStep(tampered);

    await assert.rejects(async () => queryController.getRunStepEvidence({ runId: 'run-tampered' }), /EVIDENCE_INTEGRITY_VIOLATION/);
  } finally {
    await app.close();
  }
});
