import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectState, makeEvent } from '@ai-orchestrator/core';
import { WorkflowPolicyError } from '@ai-orchestrator/shared';
import { InMemoryStateStore } from '@ai-orchestrator/state';

import { createLeaseProtectedStateStore } from './lease-protected-state-store.js';

test('LeaseProtectedStateStore fails state writes when current lease is stale', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const baseStore = new InMemoryStateStore(state);
  const guardedStore = createLeaseProtectedStateStore(baseStore, {
    requireValid: async () => {
      throw new WorkflowPolicyError('Execution lease is no longer valid', {
        details: { reason: 'stale_fencing_token' },
      });
    },
  });

  await assert.rejects(
    async () => guardedStore.recordEvent(makeEvent('TASK_SELECTED', { taskId: 'task-1' }, { runId: 'run-1' })),
    (error: unknown) =>
      error instanceof WorkflowPolicyError
      && error.details !== undefined
      && typeof error.details === 'object'
      && (error.details as Record<string, unknown>).reason === 'stale_fencing_token',
  );

  assert.equal((await baseStore.listEvents()).length, 0);
});

test('LeaseProtectedStateStore delegates reads without requiring a lease', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const baseStore = new InMemoryStateStore(state);
  const guardedStore = createLeaseProtectedStateStore(baseStore, {
    requireValid: async () => {
      throw new Error('read should not require lease validation');
    },
  });

  const loaded = await guardedStore.load();

  assert.equal(loaded.projectId, 'p1');
});
