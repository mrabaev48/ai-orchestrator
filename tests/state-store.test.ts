import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProjectState,
  makeEvent,
} from '@ai-orchestrator/core';
import { StateStoreError } from '@ai-orchestrator/shared';
import {
  createPostgresMigrations,
  InMemoryStateStore,
  InMemoryObservabilityStore,
  POSTGRES_REQUIRED_SCHEMA_VERSION,
  PostgresMigrationRunner,
  validatePostgresMigrations,
  type PostgresAppliedMigration,
  type PostgresMigration,
} from '@ai-orchestrator/state';
import type { PgPoolLike, PgQueryResult, PgTransactionClient } from '../packages/state/src/postgres/pg.js';

function makeState() {
  const state = createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature',
    outcome: 'Outcome',
    risks: [],
    taskIds: ['task-1'],
  };
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/core'],
    estimatedRisk: 'low',
  };

  return state;
}

test('InMemoryStateStore records failures and marks tasks done', async () => {
  const store = new InMemoryStateStore(makeState());
  const failureResult = await store.recordFailure({
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Missing tests',
  });
  await store.markTaskDone('task-1', 'Implemented successfully');

  const state = await store.load();
  assert.equal(failureResult.retryCount, 1);
  assert.equal(state.execution.retryCounts['task-1'], 1);
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.artifacts.length, 1);
});

test('InMemoryStateStore preserves the full failure persistence contract', async () => {
  const store = new InMemoryStateStore(makeState());
  const deadLetteredAt = new Date('2026-05-06T12:00:00.000Z').toISOString();

  const firstFailure = await store.recordFailure({
    taskId: 'task-1',
    role: 'tester',
    reason: 'Tests failed',
    symptoms: ['unit test red'],
    badPatterns: ['missing regression'],
    retrySuggested: false,
    status: 'dead_lettered',
    checkpointRunId: 'run-1',
    checkpointStepId: 'step-1',
    deadLetteredAt,
  });
  const secondFailure = await store.recordFailure({
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Review rejected',
  });

  const state = await store.load();
  const persistedFailure = state.failures[0];
  assert.equal(firstFailure.retryCount, 1);
  assert.equal(secondFailure.retryCount, 2);
  assert.equal(state.execution.retryCounts['task-1'], 2);
  assert.equal(persistedFailure?.taskId, 'task-1');
  assert.equal(persistedFailure?.role, 'tester');
  assert.equal(persistedFailure?.reason, 'Tests failed');
  assert.deepEqual(persistedFailure?.symptoms, ['unit test red']);
  assert.deepEqual(persistedFailure?.badPatterns, ['missing regression']);
  assert.equal(persistedFailure?.retrySuggested, false);
  assert.equal(persistedFailure?.status, 'dead_lettered');
  assert.equal(persistedFailure?.checkpointRunId, 'run-1');
  assert.equal(persistedFailure?.checkpointStepId, 'step-1');
  assert.equal(persistedFailure?.deadLetteredAt, deadLetteredAt);
});

test('Postgres failure_log migrations include the full failure contract fields', () => {
  const migrations = createPostgresMigrations((name) => name);
  const failureContractMigration = migrations.find((migration) => migration.name === 'failure_log_contract_fields');

  assert.ok(failureContractMigration);
  assert.deepEqual(failureContractMigration.statements, [
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS status TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS checkpoint_run_id TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS checkpoint_step_id TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ',
  ]);
});

test('Postgres migrations include dedicated observability telemetry storage', () => {
  const migrations = createPostgresMigrations((name) => name);
  const observabilityMigration = migrations.find((migration) => migration.name === 'observability_telemetry_store');

  assert.ok(observabilityMigration);
  assert.equal(observabilityMigration.statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS telemetry_metrics')), true);
  assert.equal(observabilityMigration.statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS telemetry_spans')), true);
  assert.equal(observabilityMigration.statements.some((statement) => statement.includes('expires_at')), true);
});

test('Postgres migrations expose stable checksums and required schema version', () => {
  const migrations = createPostgresMigrations((name) => name);

  assert.equal(migrations.at(-1)?.id, POSTGRES_REQUIRED_SCHEMA_VERSION);
  assert.equal(migrations.every((migration) => /^[a-f0-9]{64}$/.test(migration.checksum)), true);
});

test('Postgres migration validation rejects duplicate migration ids', () => {
  const migrations = createPostgresMigrations((name) => name);
  const duplicate = [
    migrations[0],
    { ...migrations[1], id: migrations[0]?.id ?? 1 },
    ...migrations.slice(2),
  ].filter((migration): migration is PostgresMigration => migration != null);

  assert.throws(
    () => {
      validatePostgresMigrations(duplicate);
    },
    /duplicate ids|ordered by ascending id/,
  );
});

test('Postgres migration runner applies pending migrations and records history', async () => {
  const pool = new FakeMigrationPool();
  const runner = new PostgresMigrationRunner(pool, {
    migrations: createPostgresMigrations((name) => name),
  });

  const result = await runner.applyPendingMigrations();

  assert.equal(result.requiredVersion, POSTGRES_REQUIRED_SCHEMA_VERSION);
  assert.equal(result.appliedVersion, POSTGRES_REQUIRED_SCHEMA_VERSION);
  assert.deepEqual(pool.appliedRows.map((row) => row.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(pool.queries.some((query) => query.sql.includes('CREATE SCHEMA IF NOT EXISTS')), true);
  assert.equal(pool.queries.filter((query) => query.sql === 'BEGIN').length, POSTGRES_REQUIRED_SCHEMA_VERSION);
});

test('Postgres migration runner applies only missing migrations from contiguous history', async () => {
  const migrations = createPostgresMigrations((name) => name);
  const pool = new FakeMigrationPool(migrations.slice(0, 7).map(toAppliedMigration));
  const runner = new PostgresMigrationRunner(pool, { migrations });

  const result = await runner.applyPendingMigrations();

  assert.equal(result.appliedVersion, POSTGRES_REQUIRED_SCHEMA_VERSION);
  assert.deepEqual(pool.insertedMigrationIds, [8]);
});

test('InMemoryObservabilityStore keeps telemetry outside state snapshots and purges expired records', async () => {
  const state = makeState();
  const stateStore = new InMemoryStateStore(state);
  const observabilityStore = new InMemoryObservabilityStore({ retentionDays: 1 });

  await observabilityStore.recordMetric({
    name: 'task_run_total',
    metricType: 'counter',
    value: 1,
    runId: 'run-1',
    tags: { taskId: 'task-1', status: 'completed' },
    createdAt: '2026-05-01T00:00:00.000Z',
  });
  await observabilityStore.recordSpan({
    spanName: 'task_run',
    durationMs: 42,
    status: 'ok',
    runId: 'run-1',
    taskId: 'task-1',
    tags: { taskId: 'task-1' },
    createdAt: '2026-05-01T00:00:00.000Z',
  });

  const loadedState = await stateStore.load();
  assert.equal(loadedState.artifacts.length, 0);
  assert.equal((await stateStore.listEvents()).length, 0);
  assert.equal((await observabilityStore.listMetrics()).length, 1);
  assert.equal((await observabilityStore.listSpans()).length, 1);

  const purged = await observabilityStore.purgeExpired('2026-05-02T00:00:00.001Z');
  assert.equal(purged, 2);
  assert.equal((await observabilityStore.listMetrics()).length, 0);
  assert.equal((await observabilityStore.listSpans()).length, 0);
});

test('Postgres migration runner rejects checksum mismatches', async () => {
  const migrations = createPostgresMigrations((name) => name);
  const pool = new FakeMigrationPool([
    {
      ...toAppliedMigration(migrations[0]!),
      checksum: '0'.repeat(64),
    },
  ]);
  const runner = new PostgresMigrationRunner(pool, { migrations });

  await assert.rejects(
    async () => runner.verifySchemaCompatibility(),
    /checksum mismatch/,
  );
});

test('Postgres verify-only compatibility check does not run schema DDL when history is missing', async () => {
  const pool = new FakeMigrationPool([], { historyTableMissing: true });
  const runner = new PostgresMigrationRunner(pool, {
    migrations: createPostgresMigrations((name) => name),
  });

  await assert.rejects(
    async () => runner.verifySchemaCompatibility(),
    /not migrated to the required version/,
  );
  assert.equal(pool.queries.some((query) => query.sql.includes('CREATE SCHEMA')), false);
  assert.equal(pool.queries.some((query) => query.sql === 'BEGIN'), false);
});

test('InMemoryStateStore rejects stale whole-snapshot saves without losing newer state', async () => {
  const store = new InMemoryStateStore(makeState());
  const firstWriter = await store.load();
  const staleWriter = await store.load();

  firstWriter.summary = 'Updated by first writer';
  await store.save(firstWriter, { expectedRevision: firstWriter.revision });

  staleWriter.projectName = 'Stale writer project name';
  await assert.rejects(
    async () => store.save(staleWriter, { expectedRevision: staleWriter.revision }),
    isRevisionConflict,
  );

  const state = await store.load();
  assert.equal(state.revision, 1);
  assert.equal(state.summary, 'Updated by first writer');
  assert.equal(state.projectName, 'Project');
});

test('InMemoryStateStore rejects stale saveWithEvents without recording events', async () => {
  const store = new InMemoryStateStore(makeState());
  const firstWriter = await store.load();
  const staleWriter = await store.load();

  firstWriter.summary = 'Committed summary';
  await store.save(firstWriter, { expectedRevision: firstWriter.revision });

  staleWriter.summary = 'Stale summary';
  await assert.rejects(
    async () =>
      store.saveWithEvents(
        staleWriter,
        [makeEvent('STATE_COMMITTED', { taskId: 'task-1' })],
        { expectedRevision: staleWriter.revision },
      ),
    isRevisionConflict,
  );

  assert.deepEqual(await store.listEvents(), []);
  assert.equal((await store.load()).summary, 'Committed summary');
});

test('InMemoryStateStore serializes concurrent mutation methods without lost updates', async () => {
  const store = new InMemoryStateStore(makeState());

  await Promise.all([
    store.recordArtifact({
      id: 'artifact-1',
      type: 'report',
      title: 'First report',
      metadata: { taskId: 'task-1' },
      createdAt: new Date().toISOString(),
    }),
    store.recordArtifact({
      id: 'artifact-2',
      type: 'report',
      title: 'Second report',
      metadata: { taskId: 'task-1' },
      createdAt: new Date().toISOString(),
    }),
    store.recordFailure({
      taskId: 'task-1',
      role: 'reviewer',
      reason: 'Concurrent failure',
    }),
  ]);

  const state = await store.load();
  assert.equal(state.revision, 3);
  assert.equal(state.artifacts.length, 2);
  assert.deepEqual(state.artifacts.map((artifact) => artifact.id).sort(), ['artifact-1', 'artifact-2']);
  assert.equal(state.failures.length, 1);
  assert.equal(state.execution.retryCounts['task-1'], 1);
});

test('InMemoryStateStore rejects artifacts that violate schema registry', async () => {
  const store = new InMemoryStateStore(makeState());

  await assert.rejects(
    async () =>
      store.recordArtifact({
        id: 'artifact-1',
        type: 'release_assessment',
        title: 'Release assessment',
        metadata: {},
        createdAt: new Date().toISOString(),
      }),
    /Artifact schema validation failed/,
  );
});


test('InMemoryStateStore enforces closed run-step status transitions per attempt', async () => {
  const store = new InMemoryStateStore(makeState());
  const now = Date.now();

  const base = {
    tenantId: 'default-org',
    projectId: 'proj-1',
    runId: 'run-1',
    stepId: 'step-1',
    attempt: 0,
    role: 'tester',
    input: 'input',
    output: 'output',
    idempotencyKey: 'key-1',
    checksum: 'checksum-1',
    traceId: 'trace-1',
    durationMs: 1,
    createdAt: new Date(now).toISOString(),
  } as const;

  await store.recordRunStep({ id: 'ev-1', ...base, status: 'cancellation_requested' });
  await store.recordRunStep({ id: 'ev-2', ...base, status: 'cancelled', checksum: 'checksum-2', createdAt: new Date(now + 1_000).toISOString() });

  await assert.rejects(
    async () =>
      store.recordRunStep({
        id: 'ev-3',
        ...base,
        status: 'cancelled',
        checksum: 'checksum-3',
        createdAt: new Date(now + 2_000).toISOString(),
      }),
    /Illegal run step status transition/,
  );
});



test('InMemoryStateStore rejects run-step records from a different tenant/project scope', async () => {
  const store = new InMemoryStateStore(makeState());
  await assert.rejects(
    async () =>
      store.recordRunStep({
        id: 'ev-cross-tenant',
        tenantId: 'other-tenant',
        projectId: 'proj-1',
        runId: 'run-1',
        stepId: 'step-1',
        attempt: 0,
        role: 'tester',
        input: 'input',
        output: 'output',
        status: 'succeeded',
        idempotencyKey: 'key-1',
        checksum: 'checksum-1',
        traceId: 'trace-1',
        durationMs: 1,
        createdAt: new Date().toISOString(),
      }),
    /TENANT_PARTITION_GUARD_VIOLATION/,
  );
});

function isRevisionConflict(error: unknown): boolean {
  return error instanceof StateStoreError
    && error.details != null
    && typeof error.details === 'object'
    && 'code' in error.details
    && error.details.code === 'STATE_REVISION_CONFLICT';
}

interface FakeQuery {
  readonly sql: string;
  readonly values?: readonly unknown[];
}

interface FakeMigrationPoolOptions {
  readonly historyTableMissing?: boolean;
}

class FakeMigrationPool implements PgPoolLike, PgTransactionClient {
  readonly queries: FakeQuery[] = [];
  readonly appliedRows: PostgresAppliedMigration[];
  readonly insertedMigrationIds: number[] = [];

  constructor(
    appliedRows: readonly PostgresAppliedMigration[] = [],
    private readonly options: FakeMigrationPoolOptions = {},
  ) {
    this.appliedRows = appliedRows.map((migration) => ({ ...migration }));
  }

  async connect(): Promise<PgTransactionClient> {
    return this;
  }

  release(): void {
    return undefined;
  }

  async query<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<Row>> {
    this.queries.push(values ? { sql, values } : { sql });

    if (sql.includes('SELECT id, name, checksum, applied_at, execution_ms')) {
      if (this.options.historyTableMissing) {
        throw Object.assign(new Error('relation does not exist'), { code: '42P01' });
      }
      return {
        rows: this.appliedRows.map((migration) => ({
          id: migration.id,
          name: migration.name,
          checksum: migration.checksum,
          applied_at: migration.appliedAt,
          execution_ms: migration.executionMs,
        } as unknown as Row)),
      };
    }

    if (sql.includes('INSERT INTO') && sql.includes('schema_migrations')) {
      const [id, name, checksum, executionMs] = values ?? [];
      if (typeof id !== 'number' || typeof name !== 'string' || typeof checksum !== 'string') {
        throw new Error('Invalid fake migration insert values');
      }
      this.insertedMigrationIds.push(id);
      this.appliedRows.push({
        id,
        name,
        checksum,
        appliedAt: '2026-05-12T00:00:00.000Z',
        executionMs: typeof executionMs === 'number' ? executionMs : 0,
      });
    }

    return { rows: [] };
  }
}

function toAppliedMigration(migration: PostgresMigration): PostgresAppliedMigration {
  return {
    id: migration.id,
    name: migration.name,
    checksum: migration.checksum,
    appliedAt: '2026-05-12T00:00:00.000Z',
    executionMs: 1,
  };
}

