import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIdempotencyKey } from '../packages/core/src/idempotency/build-idempotency-key.ts';

test('buildIdempotencyKey builds deterministic key for canonical object payload', () => {
  const first = buildIdempotencyKey({
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_push',
    attempt: 2,
    sideEffectType: 'git_push',
    normalizedInput: { b: 2, a: 1, nested: { y: '2', x: '1' } },
  });

  const second = buildIdempotencyKey({
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_push',
    attempt: 2,
    sideEffectType: 'git_push',
    normalizedInput: { nested: { x: '1', y: '2' }, a: 1, b: 2 },
  });

  assert.equal(first, second);
  assert.match(first, /^tenant-1:project-1:run-1:task-1:git_push:2:git_push-[a-f0-9]{64}$/);
});

test('buildIdempotencyKey distinguishes different normalized inputs', () => {
  const first = buildIdempotencyKey({
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_commit',
    attempt: 0,
    sideEffectType: 'git_commit',
    normalizedInput: { message: 'A' },
  });
  const second = buildIdempotencyKey({
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    taskId: 'task-1',
    stage: 'git_commit',
    attempt: 0,
    sideEffectType: 'git_commit',
    normalizedInput: { message: 'B' },
  });

  assert.notEqual(first, second);
});

test('buildIdempotencyKey validates attempt and key parts', () => {
  assert.throws(
    () =>
      buildIdempotencyKey({
        tenantId: 'tenant-1',
        projectId: 'project-1',
        runId: 'run-1',
        taskId: 'task-1',
        stage: 'git_commit',
        attempt: -1,
        sideEffectType: 'git_commit',
        normalizedInput: 'value',
      }),
    /attempt must be an integer >= 0/,
  );

  assert.throws(
    () =>
      buildIdempotencyKey({
        tenantId: 'tenant-1',
        projectId: 'project:1',
        runId: 'run-1',
        taskId: 'task-1',
        stage: 'git_commit',
        attempt: 0,
        sideEffectType: 'git_commit',
        normalizedInput: 'value',
      }),
    /must not include ':'/,
  );
});
