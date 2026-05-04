import assert from 'node:assert/strict';
import test from 'node:test';

import type { LogEntry, Logger } from '../../../shared/src/index.ts';
import { QueueLeaseManager } from './lease-manager.ts';
import { InMemoryQueueLeaseStore } from '../../../state/src/leases/lease-store.ts';

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

void test('QueueLeaseManager: acquire + heartbeat + release success path', async () => {
  const store = new InMemoryQueueLeaseStore();
  const manager = new QueueLeaseManager(store, new TestLogger(), {
    ownerId: 'worker-1',
    ttlMs: 1_000,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });

  const acquired = await manager.acquire('job-1', 'lease-1');
  assert.equal(acquired.acquired, true);
  if (!acquired.acquired) {
    return;
  }

  assert.deepEqual(await acquired.handle.heartbeat(), { ok: true });
  assert.deepEqual(await acquired.handle.release(), { ok: true });
});

void test('QueueLeaseManager: second worker is blocked while lease is active', async () => {
  const store = new InMemoryQueueLeaseStore();
  const workerA = new QueueLeaseManager(store, new TestLogger(), {
    ownerId: 'worker-a',
    ttlMs: 1_000,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const workerB = new QueueLeaseManager(store, new TestLogger(), {
    ownerId: 'worker-b',
    ttlMs: 1_000,
    now: () => new Date('2026-01-01T00:00:00.100Z'),
  });

  const first = await workerA.acquire('job-1', 'lease-a');
  assert.equal(first.acquired, true);

  const second = await workerB.acquire('job-1', 'lease-b');
  assert.deepEqual(second, { acquired: false, reason: 'already_leased' });
});

void test('QueueLeaseManager: heartbeat fails on ownership mismatch', async () => {
  const store = new InMemoryQueueLeaseStore();
  const workerA = new QueueLeaseManager(store, new TestLogger(), {
    ownerId: 'worker-a',
    ttlMs: 1_000,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });

  const acquired = await workerA.acquire('job-1', 'lease-a');
  assert.equal(acquired.acquired, true);

  const heartbeatByWrongLease = await store.heartbeat({
    jobId: 'job-1',
    ownerId: 'worker-a',
    leaseId: 'lease-b',
    nowIso: '2026-01-01T00:00:00.200Z',
    ttlMs: 1000,
  });

  assert.deepEqual(heartbeatByWrongLease, {
    renewed: false,
    reason: 'lease_owner_mismatch',
    lease: {
      jobId: 'job-1',
      ownerId: 'worker-a',
      leaseId: 'lease-a',
      acquiredAtIso: '2026-01-01T00:00:00.000Z',
      heartbeatAtIso: '2026-01-01T00:00:00.000Z',
      expiresAtIso: '2026-01-01T00:00:01.000Z',
    },
  });
});
