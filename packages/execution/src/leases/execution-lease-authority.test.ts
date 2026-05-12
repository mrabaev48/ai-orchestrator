import assert from 'node:assert/strict';
import test from 'node:test';

import type { LogEntry, Logger, RuntimeConfig } from '@ai-orchestrator/shared';
import { WorkflowPolicyError } from '@ai-orchestrator/shared';
import { InMemoryDistributedLockStore } from '@ai-orchestrator/state';

import { createExecutionLeaseAuthority } from './execution-lease-authority.js';

const noop = (): void => undefined;

class TestLogger implements Logger {
  debug = noop;
  info = noop;
  warn = noop;
  error = noop;
  withContext(context: Partial<LogEntry>): Logger {
    void context;
    return this;
  }
}

function makeConfig(): RuntimeConfig {
  return {
    llm: { provider: 'mock', model: 'mock-model', temperature: 0.2, timeoutMs: 1_000 },
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
      workerCount: 1,
      runLockProvider: 'noop',
      fencingTtlMs: 1_000,
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      allowedShellCommands: ['node'],
      typescriptDiagnosticsEnabled: true,
      persistToolEvidence: true,
    },
    logging: { level: 'error', format: 'json' },
  };
}

test('ExecutionLeaseAuthority acquires, renews, validates, and releases one lease', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const store = new InMemoryDistributedLockStore();
  const authority = createExecutionLeaseAuthority(makeConfig(), new TestLogger(), {
    store,
    ttlMs: 1_000,
    now: () => now,
  });

  const handle = await authority.acquireRunLease({
    resource: 'global-run-cycle',
    ownerId: 'run-1',
    scope: { tenantId: 'tenant-1', projectId: 'project-1' },
  });
  assert.ok(handle);
  assert.equal(handle.lease.resource, 'tenant-1:project-1:global-run-cycle');
  assert.equal(handle.lease.fencingToken, 1);

  now = new Date('2026-01-01T00:00:00.750Z');
  const renewed = await handle.renew();
  assert.equal(renewed.renewed, true);
  assert.equal(handle.lease.expiresAtIso, '2026-01-01T00:00:01.750Z');
  assert.equal((await handle.validate()).valid, true);

  await handle.release();
});

test('ExecutionLeaseAuthority blocks contenders while lease is active', async () => {
  const store = new InMemoryDistributedLockStore();
  const authority = createExecutionLeaseAuthority(makeConfig(), new TestLogger(), {
    store,
    ttlMs: 1_000,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });

  const first = await authority.acquireRunLease({ resource: 'global-run-cycle', ownerId: 'run-1' });
  const second = await authority.acquireRunLease({ resource: 'global-run-cycle', ownerId: 'run-2' });

  assert.ok(first);
  assert.equal(second, null);
});

test('ExecutionLeaseAuthority rejects stale owners after lease expiry and replacement', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const store = new InMemoryDistributedLockStore();
  const authority = createExecutionLeaseAuthority(makeConfig(), new TestLogger(), {
    store,
    ttlMs: 100,
    now: () => now,
  });

  const stale = await authority.acquireRunLease({ resource: 'global-run-cycle', ownerId: 'run-1' });
  assert.ok(stale);

  now = new Date('2026-01-01T00:00:00.101Z');
  const fresh = await authority.acquireRunLease({ resource: 'global-run-cycle', ownerId: 'run-2' });
  assert.ok(fresh);

  await assert.rejects(
    async () => stale.requireValid(),
    (error: unknown) =>
      error instanceof WorkflowPolicyError
      && error.details !== undefined
      && typeof error.details === 'object'
      && (error.details as Record<string, unknown>).reason === 'owner_mismatch',
  );
});
