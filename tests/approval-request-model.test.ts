import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImmutableApprovalRequest,
  type ImmutableApprovalRequest,
} from '../packages/core/src/approval/approval-request.ts';

class InMemoryApprovalStore {
  private readonly entries = new Map<string, ImmutableApprovalRequest>();

  async listByRunId(runId: string): Promise<readonly ImmutableApprovalRequest[]> {
    return [...this.entries.values()].filter((entry) => entry.runId === runId);
  }

  async getById(requestId: string): Promise<ImmutableApprovalRequest | null> {
    return this.entries.get(requestId) ?? null;
  }

  async append(request: ImmutableApprovalRequest): Promise<void> {
    if (this.entries.has(request.id)) {
      throw new Error(`Duplicate approval request id: ${request.id}`);
    }
    this.entries.set(request.id, request);
  }
}

function makePendingRequest(): ImmutableApprovalRequest {
  return {
    id: 'approval-1',
    runId: 'run-1',
    taskId: 'task-1',
    reason: 'Need approval for push',
    requestedAction: 'git_push',
    riskLevel: 'high',
    status: 'pending',
    metadata: { branchName: 'feature/task-1' },
    createdAt: '2026-05-01T10:00:00.000Z',
  };
}

test('createImmutableApprovalRequest returns frozen object with frozen metadata', () => {
  const approval = createImmutableApprovalRequest(makePendingRequest());

  assert.equal(Object.isFrozen(approval), true);
  assert.equal(Object.isFrozen(approval.metadata), true);
});

test('createImmutableApprovalRequest rejects invalid lifecycle payload', () => {
  assert.throws(
    () =>
      createImmutableApprovalRequest({
        ...makePendingRequest(),
        status: 'approved',
      }),
    /approved status requires approvedAt and approvedBy/,
  );
});

test('ApprovalStore contract supports immutable append and read', async () => {
  const store = new InMemoryApprovalStore();
  const approval = createImmutableApprovalRequest(makePendingRequest());

  await store.append(approval);
  const byId = await store.getById(approval.id);
  const byRun = await store.listByRunId('run-1');

  assert.deepEqual(byId, approval);
  assert.equal(byRun.length, 1);
  assert.equal(byRun[0]?.id, approval.id);
});
