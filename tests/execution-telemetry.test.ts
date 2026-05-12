import assert from 'node:assert/strict';
import test from 'node:test';

import { ObservabilityStoreExecutionTelemetry } from '@ai-orchestrator/execution';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import { InMemoryObservabilityStore } from '@ai-orchestrator/state';
import type { ObservabilityStore, TelemetryMetricRecord } from '@ai-orchestrator/state';

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
      level: 'info',
      format: 'json',
    },
  };
}

test('ObservabilityStoreExecutionTelemetry persists typed metric records outside domain events', async () => {
  const store = new InMemoryObservabilityStore();
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const telemetry = new ObservabilityStoreExecutionTelemetry(store, logger);

  await telemetry.incrementCounter({
    name: 'run_lock_contention_total',
    value: 1,
    runId: 'run-1',
    tags: { lock_resource: 'global-run-cycle' },
  });

  assert.equal(store.metrics.length, 1);
  assert.deepEqual(stripGeneratedTelemetryFields(store.metrics[0]), {
    metricType: 'counter',
    name: 'run_lock_contention_total',
    value: 1,
    tags: { lock_resource: 'global-run-cycle', runId: 'run-1' },
    runId: 'run-1',
    correlationId: 'run-1',
  });
});

test('ObservabilityStoreExecutionTelemetry persists typed span traces', async () => {
  const store = new InMemoryObservabilityStore();
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const telemetry = new ObservabilityStoreExecutionTelemetry(store, logger);
  await telemetry.recordSpan({
    spanName: 'tool_invocation',
    durationMs: 25,
    status: 'ok',
    runId: 'run-1',
    taskId: 'task-1',
    role: 'coder',
    toolName: 'file_read',
    tags: { span: 'tool_invocation' },
  });

  assert.equal(store.spans.length, 1);
  assert.deepEqual(stripGeneratedTelemetryFields(store.spans[0]), {
    spanName: 'tool_invocation',
    durationMs: 25,
    status: 'ok',
    runId: 'run-1',
    correlationId: 'run-1',
    taskId: 'task-1',
    role: 'coder',
    toolName: 'file_read',
    tags: { span: 'tool_invocation', runId: 'run-1' },
  });
});

test('ObservabilityStoreExecutionTelemetry degrades safely when metric persistence fails', async () => {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger(makeRuntimeConfig(), {
    sink: (line) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  });

  const failingStore = {
    recordMetric: async (): Promise<TelemetryMetricRecord> => {
      throw new Error('database unavailable');
    },
    recordSpan: async () => {
      throw new Error('database unavailable');
    },
    listMetrics: async () => [],
    listSpans: async () => [],
    purgeExpired: async () => 0,
  } satisfies ObservabilityStore;

  const telemetry = new ObservabilityStoreExecutionTelemetry(failingStore, logger);
  await telemetry.incrementCounter({
    name: 'run_lock_contention_total',
    value: 1,
    runId: 'run-2',
  });

  const warning = lines.find((line) => line.event === 'telemetry_metric_record_failed');
  assert.notEqual(warning, undefined);
});

function stripGeneratedTelemetryFields<TRecord extends { id: string; createdAt: string }>(
  record: TRecord | undefined,
): Omit<TRecord, 'id' | 'createdAt'> | undefined {
  if (!record) {
    return undefined;
  }
  const { id, createdAt, ...rest } = record;
  void id;
  void createdAt;
  return rest;
}
