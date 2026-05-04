import test from 'node:test';
import assert from 'node:assert/strict';

import { createDistributedLockStore } from '../packages/execution/src/locks/distributed-lock-store-factory.ts';
import { type RuntimeConfig } from '../packages/shared/src/index.ts';

function makeConfig(overrides: Partial<RuntimeConfig['workflow']> = {}): RuntimeConfig {
  return {
    llm: { provider: 'mock', model: 'mock', temperature: 0, timeoutMs: 1000 },
    state: {
      backend: 'memory', postgresDsn: 'postgresql://localhost:5432/test', postgresSchema: 'public',
      snapshotOnBootstrap: true, snapshotOnTaskCompletion: true, snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask: 1,
      workerCount: 1,
      runLockProvider: 'noop',
      fencingTtlMs: 60_000,
      ...overrides,
    },
    tools: { allowedWritePaths: ['.'], allowedShellCommands: ['node'], typescriptDiagnosticsEnabled: true, persistToolEvidence: true },
    logging: { level: 'error', format: 'json' },
  };
}

test('createDistributedLockStore uses in-memory store in single-worker noop mode', () => {
  const store = createDistributedLockStore(makeConfig());
  assert.ok(store);
});

test('createDistributedLockStore supports postgresql provider wiring', () => {
  const store = createDistributedLockStore(
    makeConfig({ workerCount: 2, runLockProvider: 'postgresql', runLockDsn: 'postgresql://localhost:5432/test' }),
  );
  assert.ok(store);
});

test('createDistributedLockStore supports etcd provider wiring', () => {
  const store = createDistributedLockStore(
    makeConfig({ workerCount: 2, runLockProvider: 'etcd', runLockDsn: 'etcd://localhost:2379' }),
  );
  assert.ok(store);
});
