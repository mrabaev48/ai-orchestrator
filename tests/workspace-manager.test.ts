import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitWorktreeWorkspaceManager,
  StaticWorkspaceManager,
} from '../packages/execution/src/workspace-manager.ts';

const execFileAsync = promisify(execFile);

test('StaticWorkspaceManager returns deterministic workspace without cleanup side effects', async () => {
  const rootPath = path.resolve('/tmp/static-workspace');
  const manager = new StaticWorkspaceManager(rootPath);

  const workspace = await manager.allocate({ runId: 'run-1' });

  assert.equal(workspace.rootPath, rootPath);
  assert.equal(workspace.initialDiff, '');
  await workspace.rollback();
  await workspace.cleanup();
});

test('GitWorktreeWorkspaceManager allocates isolated workspace and cleanup removes worktree', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-manager-repo-'));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, 'README.md'), '# repo\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoRoot });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoRoot });

  const manager = new GitWorktreeWorkspaceManager(repoRoot);
  const workspace = await manager.allocate({ runId: 'run-42' });

  const markerPath = path.join(workspace.rootPath, 'marker.txt');
  await writeFile(markerPath, 'changed', 'utf8');
  await workspace.rollback();

  await assert.rejects(async () => readFile(markerPath, 'utf8'));

  await workspace.cleanup();
  await rm(repoRoot, { recursive: true, force: true });
});
