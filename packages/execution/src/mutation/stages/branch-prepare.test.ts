import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMutationBranchName, executeBranchPrepareStage } from './branch-prepare.ts';
import type { RepoMutationPipelineContext } from '../../repo-mutation-pipeline.ts';

const createContext = (): RepoMutationPipelineContext => ({
  runId: 'Run_26',
  taskId: 'Task 26',
  workspacePath: '/tmp/workspace',
  metadata: {},
});

void test('branch_prepare: success creates normalized policy branch', async () => {
  const context = createContext();

  const result = await executeBranchPrepareStage({
    context,
    signal: new AbortController().signal,
    getCurrentBranch: async () => 'main',
    ensureBranch: async ({ branchName }) => {
      assert.equal(branchName, 'mutation/run-26-task-26');
      return { created: true };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(context.branchName, 'mutation/run-26-task-26');
  assert.equal(result.metadata?.branchAction, 'created');
});

void test('branch_prepare: failure path rejects branch outside naming policy', async () => {
  const context = createContext();
  context.branchName = 'feature/task-26';

  const result = await executeBranchPrepareStage({
    context,
    signal: new AbortController().signal,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'BRANCH_POLICY_INVALID');
  assert.equal(result.failure?.retriable, false);
});

void test('branch_prepare: regression returns noop when already on target branch', async () => {
  const context = createContext();
  const branchName = buildMutationBranchName(context);

  const result = await executeBranchPrepareStage({
    context,
    signal: new AbortController().signal,
    getCurrentBranch: async () => branchName,
    ensureBranch: async () => {
      throw new Error('must not be called');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'branch_prepare_already_on_target');
  assert.equal(result.metadata?.branchAction, 'noop');
});

void test('branch_prepare: retriable failure for transient git error', async () => {
  const result = await executeBranchPrepareStage({
    context: createContext(),
    signal: new AbortController().signal,
    getCurrentBranch: async () => 'main',
    ensureBranch: async () => {
      throw new Error('transient git checkout failure');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'BRANCH_PREPARE_FAILED');
  assert.equal(result.failure?.retriable, true);
});
