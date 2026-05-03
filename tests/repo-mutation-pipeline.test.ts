import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RepoMutationPipeline,
  type RepoMutationPipelineContext,
  type RepoMutationStageDefinition,
} from '../packages/execution/src/repo-mutation-pipeline.ts';

const context: RepoMutationPipelineContext = {
  runId: 'run-1',
  taskId: 'task-1',
  workspacePath: '/tmp/workspace',
  metadata: {},
};

test('RepoMutationPipeline: проходит все стадии success path', async () => {
  const pipeline = new RepoMutationPipeline();
  const order: string[] = [];

  const stages: RepoMutationStageDefinition[] = [
    'workspace_prepare','branch_prepare','change_apply','verification','commit_prepare','push_prepare','pr_draft_prepare','finalize',
  ].map((name) => ({
    name: name as RepoMutationStageDefinition['name'],
    timeoutMs: 500,
    maxAttempts: 1,
    execute: async () => {
      order.push(name);
      return { ok: true };
    },
  }));

  const result = await pipeline.run({ context, stages });
  assert.equal(result.ok, true);
  assert.deepEqual(order, ['workspace_prepare','branch_prepare','change_apply','verification','commit_prepare','push_prepare','pr_draft_prepare','finalize']);
  assert.equal(result.evidences.length, 8);
  assert.ok(result.evidences.every((item) => item.status === 'succeeded'));
});

test('RepoMutationPipeline: verification failure останавливает пайплайн и не идет в push/pr', async () => {
  const pipeline = new RepoMutationPipeline();
  const order: string[] = [];
  let isCompensated = false;

  const stages: RepoMutationStageDefinition[] = [
    {
      name: 'workspace_prepare',
      timeoutMs: 500,
      maxAttempts: 1,
      execute: async () => ({ ok: true }),
    },
    {
      name: 'verification',
      timeoutMs: 500,
      maxAttempts: 1,
      execute: async () => {
        order.push('verification');
        return { ok: false, failure: { code: 'VERIFY_FAIL', message: 'lint failed', retriable: false } };
      },
      compensate: async () => {
        isCompensated = true;
      },
    },
    {
      name: 'push_prepare',
      timeoutMs: 500,
      maxAttempts: 1,
      execute: async () => {
        order.push('push_prepare');
        return { ok: true };
      },
    },
  ];

  const result = await pipeline.run({ context, stages });
  assert.equal(result.ok, false);
  assert.equal(result.stoppedAt, 'verification');
  assert.deepEqual(order, ['verification']);
  assert.equal(isCompensated, true);
  assert.ok(result.evidences.some((item) => item.status === 'compensated'));
});

test('RepoMutationPipeline: retriable fail выполняет retry в рамках лимита', async () => {
  const pipeline = new RepoMutationPipeline();
  let attempt = 0;

  const stages: RepoMutationStageDefinition[] = [
    {
      name: 'push_prepare',
      timeoutMs: 500,
      maxAttempts: 2,
      execute: async () => {
        attempt += 1;
        if (attempt === 1) {
          return { ok: false, failure: { code: 'PUSH_RETRY', message: 'temporary', retriable: true } };
        }
        return { ok: true };
      },
    },
  ];

  const result = await pipeline.run({ context, stages });
  assert.equal(result.ok, true);
  assert.equal(attempt, 2);
  assert.equal(result.evidences[0]?.status, 'skipped');
  assert.equal(result.evidences[1]?.status, 'succeeded');
});


test('RepoMutationPipeline: stage timeout enforced even when stage ignores signal', async () => {
  const pipeline = new RepoMutationPipeline();

  const result = await pipeline.run({
    context,
    stages: [
      {
        name: 'verification',
        timeoutMs: 20,
        maxAttempts: 1,
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 80));
          return { ok: true };
        },
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.stoppedAt, 'verification');
  assert.equal(result.evidences[0]?.errorCode, 'STAGE_TIMEOUT');
});
