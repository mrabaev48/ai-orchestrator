import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIdempotencyKey, createEmptyProjectState } from '../packages/core/src/index.ts';
import { completeSideEffect, reserveSideEffect } from '../packages/execution/src/idempotency/side-effect-dedup-guard.ts';

test('buildIdempotencyKey is stable for canonical input', () => {
  const input = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_push',
    attempt: 2,
    sideEffectType: 'git_push',
    normalizedInput: 'branch=feature/x|sha=abc',
  };

  const key = buildIdempotencyKey(input);
  assert.equal(key, buildIdempotencyKey(input));
  assert.match(key, /^tenant-1:project-1:run-1:task-1:git_push:2:git_push-[a-f0-9]{64}$/);
});

test('reserveSideEffect suppresses duplicates once key succeeded', () => {
  const state = createEmptyProjectState({ projectId: 'p1', projectName: 'p1', summary: 's' });
  const key = buildIdempotencyKey({
    tenantId: state.orgId,
    projectId: state.projectId,
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_commit',
    attempt: 0,
    sideEffectType: 'git_commit',
    normalizedInput: 'message=x',
  });

  const first = reserveSideEffect(state.execution.dedupRegistry, {
    key,
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:00.000Z',
    ttlMs: 60_000,
  });
  assert.equal(first.dedupSuppressed, false);

  completeSideEffect(state.execution.dedupRegistry, {
    key,
    nowIso: '2026-01-01T00:00:01.000Z',
    status: 'succeeded',
    policyDecisionId: 'policy-1',
    evidenceId: 'ev-1',
  });

  const second = reserveSideEffect(state.execution.dedupRegistry, {
    key,
    leaseOwner: 'run-2',
    nowIso: '2026-01-01T00:00:02.000Z',
    ttlMs: 60_000,
  });
  assert.equal(second.dedupSuppressed, true);
});
