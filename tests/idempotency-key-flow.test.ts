import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIdempotencyKey, createEmptyProjectState } from '../packages/core/src/index.ts';
import { completeSideEffect, reserveSideEffect } from '../packages/execution/src/idempotency/side-effect-dedup-guard.ts';

test('buildIdempotencyKey is stable for canonical input', () => {
  const input = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    stepId: 'task-1:git_push',
    sideEffectType: 'git_push',
    normalizedInput: 'branch=feature/x|sha=abc',
  };

  assert.equal(buildIdempotencyKey(input), buildIdempotencyKey(input));
});

test('reserveSideEffect suppresses duplicates once key succeeded', () => {
  const state = createEmptyProjectState({ projectId: 'p1', projectName: 'p1', summary: 's' });
  const key = buildIdempotencyKey({
    tenantId: state.orgId,
    projectId: state.projectId,
    runId: 'run-1',
    stepId: 'task-1:git_commit',
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
