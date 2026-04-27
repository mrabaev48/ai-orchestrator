import assert from 'node:assert/strict';
import test from 'node:test';

import { ApprovalGateService } from '../packages/application/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

test('ApprovalGateService supports pending -> approve -> resume lifecycle', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.approvals.push({
    id: 'approval-1',
    runId: 'run-1',
    taskId: 'task-1',
    reason: 'Push branch',
    requestedAction: 'git_push',
    riskLevel: 'high',
    status: 'pending',
    metadata: { branchName: 'feature/task-1' },
    createdAt: '2026-03-10T00:00:00.000Z',
  });
  const store = new InMemoryStateStore(state);
  const service = new ApprovalGateService(store);

  const approved = await service.approve('approval-1', 'alice');
  const resumed = await service.resume('approval-1', 'alice');
  const pending = await service.list({ status: 'pending' });

  assert.equal(approved.status, 'approved');
  assert.equal(resumed.status, 'resumed');
  assert.equal(pending.length, 0);
});

test('ApprovalGateService supports reject lifecycle for pending request', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.approvals.push({
    id: 'approval-2',
    runId: 'run-1',
    taskId: 'task-2',
    reason: 'Create draft PR',
    requestedAction: 'pr_draft',
    riskLevel: 'high',
    status: 'pending',
    metadata: { branchName: 'feature/task-2' },
    createdAt: '2026-03-10T00:00:00.000Z',
  });
  const store = new InMemoryStateStore(state);
  const service = new ApprovalGateService(store);

  const rejected = await service.reject('approval-2', 'bob', 'Need more review');
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.rejectionReason, 'Need more review');
});
