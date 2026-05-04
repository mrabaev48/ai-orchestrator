import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';
import { createRecoveryCheckpointStore } from '../packages/state/src/recovery/recovery-checkpoint.store.ts';
import { resumeFromCheckpoint } from '../packages/execution/src/recovery/resume-from-checkpoint.ts';

function makeStore() {
  return new InMemoryStateStore(createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project 1',
    summary: 'summary',
  }));
}

test('recovery checkpoint success path: returns deterministic resume pointer', async () => {
  const stateStore = makeStore();
  await stateStore.recordRunStep({
    id: 'ev-1', tenantId: 'tenant-1', projectId: 'proj-1', runId: 'run-1', stepId: 'step-1', attempt: 2,
    taskId: 'task-1', role: 'coder', input: 'in', output: 'out', status: 'failed', idempotencyKey: 'run-1:step-1',
    checksum: 'checksum-1', traceId: 'trace-1', durationMs: 10, createdAt: new Date().toISOString(),
  });

  const pointer = await resumeFromCheckpoint(createRecoveryCheckpointStore(stateStore), {
    taskId: 'task-1', requestedBy: 'ops',
  });

  assert.equal(pointer.runId, 'run-1');
  assert.equal(pointer.stepId, 'step-1');
  assert.equal(pointer.nextAttempt, 3);
});

test('recovery checkpoint failure path: throws if checkpoint is missing', async () => {
  const stateStore = makeStore();

  await assert.rejects(
    async () => resumeFromCheckpoint(createRecoveryCheckpointStore(stateStore), { taskId: 'task-missing', requestedBy: 'ops' }),
    /Recovery checkpoint was not found/,
  );
});

test('recovery checkpoint regression: ignores succeeded entries and keeps latest failed', async () => {
  const stateStore = makeStore();
  const now = Date.now();
  await stateStore.recordRunStep({
    id: 'ev-1', tenantId: 'tenant-1', projectId: 'proj-1', runId: 'run-old', stepId: 'step-1', attempt: 0,
    taskId: 'task-2', role: 'coder', input: 'in', output: 'out', status: 'failed', idempotencyKey: 'k1',
    checksum: 'checksum-1', traceId: 'trace-1', durationMs: 10, createdAt: new Date(now).toISOString(),
  });
  await stateStore.recordRunStep({
    id: 'ev-2', tenantId: 'tenant-1', projectId: 'proj-1', runId: 'run-new', stepId: 'step-2', attempt: 0,
    taskId: 'task-2', role: 'coder', input: 'in', output: 'out', status: 'succeeded', idempotencyKey: 'k2',
    checksum: 'checksum-2', traceId: 'trace-2', durationMs: 10, createdAt: new Date(now + 1000).toISOString(),
  });

  const pointer = await resumeFromCheckpoint(createRecoveryCheckpointStore(stateStore), {
    taskId: 'task-2', requestedBy: 'ops',
  });
  assert.equal(pointer.runId, 'run-old');
});

test('recovery checkpoint retry path: increments attempt for timed_out and keeps traceability', async () => {
  const stateStore = makeStore();
  await stateStore.recordRunStep({
    id: 'ev-timeout', tenantId: 'tenant-1', projectId: 'proj-1', runId: 'run-3', stepId: 'step-timeout', attempt: 1,
    taskId: 'task-3', role: 'tester', input: 'in', output: 'out', status: 'timed_out', idempotencyKey: 'run-3:step-timeout:1',
    checksum: 'checksum-timeout', traceId: 'trace-timeout', durationMs: 1000, createdAt: new Date().toISOString(),
  });

  const pointer = await resumeFromCheckpoint(createRecoveryCheckpointStore(stateStore), {
    taskId: 'task-3', requestedBy: 'ops',
  });

  assert.equal(pointer.nextAttempt, 2);
  assert.match(pointer.idempotencyKey, /:resume:2$/);
  assert.equal(pointer.traceId, 'trace-timeout');
});
