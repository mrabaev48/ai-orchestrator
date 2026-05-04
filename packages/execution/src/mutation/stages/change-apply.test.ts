import assert from 'node:assert/strict';
import test from 'node:test';
import { executeChangeApplyStage } from './change-apply.ts';
import type { RepoMutationPipelineContext } from '../../repo-mutation-pipeline.ts';
import { ApplyPatchError } from '../../../../tools/src/patch/apply-patch.ts';

const context: RepoMutationPipelineContext = {
  runId: 'run-27',
  taskId: 'task-27',
  workspacePath: '/tmp/workspace',
  metadata: {},
};

void test('change_apply: success path returns diagnostics metadata', async () => {
  const result = await executeChangeApplyStage({
    context,
    patchText: 'diff --git a/a.txt b/a.txt',
    signal: new AbortController().signal,
    patchApply: async () => ({
      changedFiles: ['a.txt', 'b.txt'],
      command: 'git apply ...',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'patch_applied');
  assert.equal(result.metadata?.changedFiles, 'a.txt,b.txt');
  assert.equal(result.metadata?.changedFilesCount, '2');
});

void test('change_apply: failure path keeps structured apply failure retriable', async () => {
  const result = await executeChangeApplyStage({
    context,
    patchText: 'broken',
    signal: new AbortController().signal,
    patchApply: async () => {
      throw new ApplyPatchError('PATCH_APPLY_FAILED', 'cannot apply', { changedFiles: [], command: 'git apply' });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'PATCH_APPLY_FAILED');
  assert.equal(result.failure?.retriable, true);
});

void test('change_apply: regression empty patch is explicit non-retriable', async () => {
  const result = await executeChangeApplyStage({
    context,
    patchText: '',
    signal: new AbortController().signal,
    patchApply: async () => {
      throw new ApplyPatchError('PATCH_TEXT_EMPTY', 'Patch text is empty', { changedFiles: [], command: 'git apply' });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'PATCH_TEXT_EMPTY');
  assert.equal(result.failure?.retriable, false);
});

void test('change_apply: cancellation is non-retriable', async () => {
  const result = await executeChangeApplyStage({
    context,
    patchText: 'content',
    signal: new AbortController().signal,
    patchApply: async () => {
      throw new ApplyPatchError('PATCH_CANCELLED', 'Patch apply cancelled', { changedFiles: [], command: 'git apply' });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'PATCH_CANCELLED');
  assert.equal(result.failure?.retriable, false);
});
