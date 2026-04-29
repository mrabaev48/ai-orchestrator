import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { StateStoreExecutionTelemetry } from '../packages/execution/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';
import type { StateStore } from '../packages/state/src/index.ts';

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
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'info',
      format: 'json',
    },
  };
}

test('StateStoreExecutionTelemetry persists METRIC_RECORDED events', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const telemetry = new StateStoreExecutionTelemetry(store, logger);

  await telemetry.incrementCounter({
    name: 'run_lock_contention_total',
    value: 1,
    runId: 'run-1',
    tags: { lock_resource: 'global-run-cycle' },
  });

  assert.equal(store.events.length, 1);
  assert.equal(store.events[0]?.eventType, 'METRIC_RECORDED');
  assert.deepEqual(store.events[0]?.payload, {
    metricType: 'counter',
    name: 'run_lock_contention_total',
    value: 1,
    tags: { lock_resource: 'global-run-cycle' },
  });
});

test('StateStoreExecutionTelemetry persists histogram metrics for span traces', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const telemetry = new StateStoreExecutionTelemetry(store, logger);
  await telemetry.recordHistogram({
    name: 'span_tool_invocation_duration_ms',
    value: 25,
    runId: 'run-1',
    tags: { toolName: 'file_read', status: 'ok' },
  });
  assert.equal(store.events[0]?.eventType, 'METRIC_RECORDED');
  assert.deepEqual(store.events[0]?.payload, {
    metricType: 'histogram',
    name: 'span_tool_invocation_duration_ms',
    value: 25,
    tags: { toolName: 'file_read', status: 'ok' },
  });
});

test('StateStoreExecutionTelemetry degrades safely when metric persistence fails', async () => {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger(makeRuntimeConfig(), {
    sink: (line) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });

  const failingStore = {
    recordEvent: async () => {
      throw new Error('database unavailable');
    },
  } as unknown as StateStore;

  const telemetry = new StateStoreExecutionTelemetry(failingStore, logger);
  await telemetry.incrementCounter({
    name: 'run_lock_contention_total',
    value: 1,
    runId: 'run-2',
  });

  const warning = lines.find((line) => line.event === 'telemetry_metric_record_failed');
  assert.notEqual(warning, undefined);
});
