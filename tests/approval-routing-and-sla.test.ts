import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApprovalRoutingService,
  ApprovalSlaEscalationService,
} from '../packages/application/src/index.ts';

test('ApprovalRoutingService routes by action using explicit mapping', () => {
  const service = new ApprovalRoutingService();
  const result = service.route({
    id: 'approval-1',
    runId: 'run-1',
    taskId: 'task-1',
    requestedAction: 'security_auth_change',
  });

  assert.equal(result.route.approverGroup, 'security-reviewers');
  assert.equal(result.route.escalationGroup, 'security-incident-command');
  assert.equal(result.usedFallbackRule, false);
});

test('ApprovalSlaEscalationService marks reminder and escalation deterministically', () => {
  const now = new Date('2026-05-02T12:00:00.000Z');
  const service = new ApprovalSlaEscalationService(
    {
      reminderAfterMs: 60_000,
      escalateAfterMs: 120_000,
    },
    () => now,
  );

  const due = service.findDue([
    { id: 'approval-reminder', status: 'pending', createdAt: '2026-05-02T11:58:30.000Z' },
    { id: 'approval-escalate', status: 'pending', createdAt: '2026-05-02T11:57:30.000Z' },
    { id: 'approval-approved', status: 'approved', createdAt: '2026-05-02T11:00:00.000Z' },
  ]);

  assert.deepEqual(
    due.reminders.map((entry) => entry.approvalId),
    ['approval-reminder'],
  );
  assert.deepEqual(
    due.escalations.map((entry) => entry.approvalId),
    ['approval-escalate'],
  );
});
