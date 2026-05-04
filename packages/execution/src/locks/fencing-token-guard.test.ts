import assert from 'node:assert/strict';
import test from 'node:test';

import type { LogEntry, Logger } from '../../../shared/src/index.ts';
import { InMemoryDistributedLockStore } from '../../../state/src/locks/distributed-lock.store.ts';
import { createFencingTokenGuard } from './fencing-token-guard.ts';

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

void test('FencingTokenGuard: acquires lock with monotonic fencing token and releases', async () => {
  const store = new InMemoryDistributedLockStore();
  const guard = createFencingTokenGuard(store, new TestLogger(), { ttlMs: 5000 });

  const first = await guard.acquire('global-run-cycle', 'run-1', '2026-01-01T00:00:00.000Z');
  assert.ok(first);
  assert.equal(first.lease.fencingToken, 1);
  assert.deepEqual(await first.validate('2026-01-01T00:00:01.000Z'), { valid: true });
  await first.release();

  const second = await guard.acquire('global-run-cycle', 'run-2', '2026-01-01T00:00:02.000Z');
  assert.ok(second);
  assert.equal(second.lease.fencingToken, 2);
});

void test('FencingTokenGuard: returns null on contention', async () => {
  const store = new InMemoryDistributedLockStore();
  const guard = createFencingTokenGuard(store, new TestLogger(), { ttlMs: 5000 });

  const first = await guard.acquire('global-run-cycle', 'run-1', '2026-01-01T00:00:00.000Z');
  assert.ok(first);

  const second = await guard.acquire('global-run-cycle', 'run-2', '2026-01-01T00:00:01.000Z');
  assert.equal(second, null);
});

void test('FencingTokenGuard: validate reports expired lease', async () => {
  const store = new InMemoryDistributedLockStore();
  const guard = createFencingTokenGuard(store, new TestLogger(), { ttlMs: 1000 });

  const handle = await guard.acquire('global-run-cycle', 'run-1', '2026-01-01T00:00:00.000Z');
  assert.ok(handle);

  assert.deepEqual(await handle.validate('2026-01-01T00:00:01.001Z'), { valid: false, reason: 'expired' });
});
