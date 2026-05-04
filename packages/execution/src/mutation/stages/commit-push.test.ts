import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCommitPrepareStage, compensateCommitPrepareStage } from './commit-prepare.ts';
import { executePushPrepareStage, compensatePushPrepareStage } from './push-prepare.ts';
import type { RepoMutationPipelineContext } from '../../repo-mutation-pipeline.ts';

const context: RepoMutationPipelineContext = {
  runId: 'run-29',
  taskId: 'task-29',
  workspacePath: '/tmp/workspace',
  branchName: 'feature/task-29',
  metadata: {},
};

void test('commit_prepare: success returns commit metadata', async () => {
  const result = await executeCommitPrepareStage({
    context,
    signal: new AbortController().signal,
    message: 'feat: task 29',
    commit: async () => ({ commitSha: 'abc123' }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'git_commit_created');
  assert.equal(result.metadata?.commitSha, 'abc123');
});

void test('commit_prepare: failure returns retriable structured error', async () => {
  const result = await executeCommitPrepareStage({
    context,
    signal: new AbortController().signal,
    message: 'feat: task 29',
    commit: async () => {
      throw new Error('git commit failed');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'COMMIT_PREPARE_FAILED');
  assert.equal(result.failure?.retriable, true);
});

void test('commit_prepare compensation: invokes hard reset executor', async () => {
  let didCallCompensation = false;
  await compensateCommitPrepareStage(context, {
    resetHardHead: async (args) => {
      didCallCompensation = true;
      assert.equal(args.workspacePath, context.workspacePath);
    },
  });

  assert.equal(didCallCompensation, true);
});

void test('push_prepare: success returns branch and remote metadata', async () => {
  const result = await executePushPrepareStage({
    context,
    signal: new AbortController().signal,
    push: async () => ({ remoteRef: 'origin/feature/task-29' }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'git_push_completed');
  assert.equal(result.metadata?.branchName, 'feature/task-29');
});

void test('push_prepare: missing branch is explicit non-retriable', async () => {
  const contextWithoutBranch: RepoMutationPipelineContext = { ...context };
  delete contextWithoutBranch.branchName;

  const result = await executePushPrepareStage({
    context: contextWithoutBranch,
    signal: new AbortController().signal,
    push: async () => ({ remoteRef: 'origin/x' }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'PUSH_PREPARE_BRANCH_REQUIRED');
  assert.equal(result.failure?.retriable, false);
});

void test('push_prepare compensation: branch delete is called when branch exists', async () => {
  let didCallCompensation = false;
  await compensatePushPrepareStage(context, {
    pushDelete: async (args) => {
      didCallCompensation = true;
      assert.equal(args.branchName, context.branchName);
    },
  });
  assert.equal(didCallCompensation, true);
});
