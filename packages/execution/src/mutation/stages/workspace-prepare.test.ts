import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeWorkspacePrepareStage } from './workspace-prepare.ts';
import type { RepoMutationPipelineContext } from '../../repo-mutation-pipeline.ts';

const createContext = (workspacePath: string): RepoMutationPipelineContext => ({
  runId: 'run-25',
  taskId: 'task-25',
  workspacePath,
  metadata: {},
});

void test('workspace_prepare: success path creates snapshot metadata', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-prepare-success-'));
  const workspacePath = path.join(tempRoot, 'workspace');
  const snapshotsRoot = path.join(tempRoot, 'snapshots');
  await mkdir(workspacePath, { recursive: true });
  await writeFile(path.join(workspacePath, 'note.txt'), 'hello-snapshot', 'utf8');

  const result = await executeWorkspacePrepareStage({
    context: createContext(workspacePath),
    snapshotRootPath: snapshotsRoot,
    signal: new AbortController().signal,
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'workspace_snapshot_created');
  assert.equal(typeof result.metadata?.snapshotPath, 'string');
  const metadata: Record<string, string> | undefined = result.metadata;
  const snapshotPathValue = metadata?.snapshotPath;
  if (typeof snapshotPathValue !== 'string') {
    throw new Error('snapshotPath is required for success path');
  }
  const copiedContent = await readFile(path.join(snapshotPathValue, 'note.txt'), 'utf8');
  assert.equal(copiedContent, 'hello-snapshot');
});

void test('workspace_prepare: explicit failure path returns typed non-retriable error for missing workspace', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-prepare-missing-'));
  const result = await executeWorkspacePrepareStage({
    context: createContext(path.join(tempRoot, 'missing-workspace')),
    snapshotRootPath: path.join(tempRoot, 'snapshots'),
    signal: new AbortController().signal,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'WORKSPACE_NOT_FOUND');
  assert.equal(result.failure?.retriable, false);
});

void test('workspace_prepare: cancellation path is surfaced as non-retriable cancellation error', async () => {
  const controller = new AbortController();
  controller.abort('cancelled-by-test');

  const result = await executeWorkspacePrepareStage({
    context: createContext('/tmp/any-workspace'),
    snapshotRootPath: '/tmp/any-snapshot-root',
    signal: controller.signal,
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'SNAPSHOT_CANCELLED');
  assert.equal(result.failure?.retriable, false);
});

void test('workspace_prepare: regression - transient snapshot failure is retriable', async () => {
  const result = await executeWorkspacePrepareStage({
    context: createContext('/tmp/any-workspace'),
    snapshotRootPath: '/tmp/any-snapshot-root',
    signal: new AbortController().signal,
    createSnapshot: async () => {
      throw new Error('transient io error');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'WORKSPACE_PREPARE_FAILED');
  assert.equal(result.failure?.retriable, true);
});
