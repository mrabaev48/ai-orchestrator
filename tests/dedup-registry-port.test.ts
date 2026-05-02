import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { DedupRegistryService } from '../packages/application/src/idempotency/dedup-registry-service.ts';
import { InMemoryDedupRegistryPort } from '../packages/state/src/idempotency/in-memory-dedup-registry-port.ts';

test('dedup-registry-port: reserve/finalize success path', () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'P', summary: 'S' });
  const service = new DedupRegistryService(new InMemoryDedupRegistryPort(state.execution.dedupRegistry));

  const reserved = service.reserve({
    key: 'k1',
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:00.000Z',
    ttlMs: 60_000,
  });
  assert.equal(reserved.reserved, true);

  const finalized = service.finalize({
    key: 'k1',
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:01.000Z',
    status: 'succeeded',
    evidenceId: 'e-1',
  });
  assert.equal(finalized.finalized, true);
});

test('dedup-registry-port: finalize rejects mismatched lease owner', () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'P', summary: 'S' });
  const service = new DedupRegistryService(new InMemoryDedupRegistryPort(state.execution.dedupRegistry));

  service.reserve({
    key: 'k2',
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:00.000Z',
    ttlMs: 60_000,
  });

  const result = service.finalize({
    key: 'k2',
    leaseOwner: 'run-2',
    nowIso: '2026-01-01T00:00:01.000Z',
    status: 'failed',
  });

  const k2Entry = state.execution.dedupRegistry.k2;
  assert.ok(k2Entry);
  assert.deepEqual(result, {
    finalized: false,
    reason: 'lease_owner_mismatch',
    entry: k2Entry,
  });
  assert.equal(k2Entry.status, 'pending');
});

test('dedup-registry-port: expired lease allows deterministic re-reserve', () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'P', summary: 'S' });
  const service = new DedupRegistryService(new InMemoryDedupRegistryPort(state.execution.dedupRegistry));

  service.reserve({
    key: 'k3',
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:00.000Z',
    ttlMs: 1,
  });

  const second = service.reserve({
    key: 'k3',
    leaseOwner: 'run-2',
    nowIso: '2026-01-01T00:00:10.000Z',
    ttlMs: 60_000,
  });

  assert.equal(second.reserved, true);
  const k3Entry = state.execution.dedupRegistry.k3;
  assert.ok(k3Entry);
  assert.equal(k3Entry.leaseOwner, 'run-2');
});
