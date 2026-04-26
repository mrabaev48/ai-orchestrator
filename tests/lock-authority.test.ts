import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLockAuthority,
  EtcdLockAuthority,
  NoopLockAuthority,
  RedisLockAuthority,
} from '../packages/execution/src/index.ts';
import { WorkflowPolicyError } from '../packages/shared/src/index.ts';
import type { RuntimeConfig } from '../packages/shared/src/index.ts';

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1_000,
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
      maxStepsPerRun: 8,
      maxRetriesPerTask: 3,
      workerCount: 1,
      runLockProvider: 'noop',
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      allowedShellCommands: ['node'],
      typescriptDiagnosticsEnabled: true,
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('createLockAuthority defaults to NoopLockAuthority in single-worker mode', () => {
  const authority = createLockAuthority(makeRuntimeConfig());
  assert.equal(authority instanceof NoopLockAuthority, true);
});

test('RedisLockAuthority acquires and releases lock with ownership token', async () => {
  const events: { type: 'set' | 'eval'; key: string; args?: string[] }[] = [];
  const authority = new RedisLockAuthority('redis://localhost:6379', {
    loadClient: async () => ({
      set: async (key: string) => {
        events.push({ type: 'set', key });
        return 'OK';
      },
      eval: async (_script: string, options: { keys: string[]; arguments: string[] }) => {
        events.push({ type: 'eval', key: options.keys[0] ?? '', args: options.arguments });
        return 1;
      },
    }),
  });

  const handle = await authority.acquireRunLock('run-a');
  assert.notEqual(handle, null);
  await handle?.release();

  assert.deepEqual(events[0], { type: 'set', key: 'ai-orchestrator:run-lock:run-a' });
  assert.equal(events[1]?.type, 'eval');
  assert.equal(events[1]?.key, 'ai-orchestrator:run-lock:run-a');
  assert.equal(events[1]?.args?.length, 1);
});

test('RedisLockAuthority returns null when lock is contended', async () => {
  const authority = new RedisLockAuthority('redis://localhost:6379', {
    loadClient: async () => ({
      set: async () => null,
      eval: async () => 0,
    }),
  });

  const handle = await authority.acquireRunLock('run-a');
  assert.equal(handle, null);
});

test('RedisLockAuthority surfaces acquire runtime errors as WorkflowPolicyError', async () => {
  const authority = new RedisLockAuthority('redis://localhost:6379', {
    loadClient: async () => ({
      set: async () => {
        throw new Error('redis unavailable');
      },
      eval: async () => 0,
    }),
  });

  await assert.rejects(
    async () => authority.acquireRunLock('run-a'),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.details !== undefined &&
      typeof error.details === 'object' &&
      (error.details as Record<string, unknown>).provider === 'redis' &&
      (error.details as Record<string, unknown>).operation === 'acquire',
  );
});

test('EtcdLockAuthority acquires and releases lease-backed lock', async () => {
  const events: string[] = [];
  const authority = new EtcdLockAuthority('etcd://localhost:2379', {
    loadClient: async () => ({
      lease: () => ({
        put: (key: string) => ({
          value: async () => {
            events.push(`put:${key}`);
          },
        }),
        revoke: async () => {
          events.push('revoke');
        },
      }),
    }),
  });

  const handle = await authority.acquireRunLock('run-b');
  assert.notEqual(handle, null);
  await handle?.release();

  assert.deepEqual(events, ['put:ai-orchestrator/run-lock/run-b', 'revoke']);
});

test('EtcdLockAuthority returns null when lock is contended', async () => {
  let isRevoked = false;
  const authority = new EtcdLockAuthority('etcd://localhost:2379', {
    loadClient: async () => ({
      lease: () => ({
        put: () => ({
          value: async () => {
            throw new Error('already exists');
          },
        }),
        revoke: async () => {
          isRevoked = true;
        },
      }),
    }),
  });

  const handle = await authority.acquireRunLock('run-b');
  assert.equal(handle, null);
  assert.equal(isRevoked, true);
});

test('EtcdLockAuthority surfaces acquire runtime errors as WorkflowPolicyError', async () => {
  const authority = new EtcdLockAuthority('etcd://localhost:2379', {
    loadClient: async () => ({
      lease: () => ({
        put: () => ({
          value: async () => {
            throw new Error('network timeout');
          },
        }),
        revoke: async () => {},
      }),
    }),
  });

  await assert.rejects(
    async () => authority.acquireRunLock('run-b'),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.details !== undefined &&
      typeof error.details === 'object' &&
      (error.details as Record<string, unknown>).provider === 'etcd' &&
      (error.details as Record<string, unknown>).operation === 'acquire',
  );
});
