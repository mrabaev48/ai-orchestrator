import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitWorktreeWorkspaceManager,
  parsePrunedWorktreeCount,
  StaticWorkspaceManager,
} from '../packages/execution/src/workspace-manager.ts';

const execFileAsync = promisify(execFile);

test('StaticWorkspaceManager returns deterministic workspace without cleanup side effects', async () => {
  const rootPath = path.resolve('/tmp/static-workspace');
  const manager = new StaticWorkspaceManager(rootPath);

  const workspace = await manager.allocate({ runId: 'run-1', tenantId: 'tenant-1', projectId: 'project-1' });

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

  const manager = new GitWorktreeWorkspaceManager(repoRoot, 24);
  const workspace = await manager.allocate({ runId: 'run-42', tenantId: 'tenant-1', projectId: 'project-1' });

  const markerPath = path.join(workspace.rootPath, 'marker.txt');
  await writeFile(markerPath, 'changed', 'utf8');
  await workspace.rollback();

  await assert.rejects(async () => readFile(markerPath, 'utf8'));

  await workspace.cleanup();
  await rm(repoRoot, { recursive: true, force: true });
});

test('GitWorktreeWorkspaceManager prunes stale orchestrator branches using ttl', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'workspace-manager-ttl-repo-'));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
  await writeFile(path.join(repoRoot, 'README.md'), '# repo\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoRoot });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoRoot });
  await execFileAsync('git', ['checkout', '-b', 'orchestrator/run-stale'], { cwd: repoRoot });
  await execFileAsync('git', ['commit', '--allow-empty', '-m', 'stale'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    },
  });
  await execFileAsync('git', ['checkout', 'main'], { cwd: repoRoot });

  const manager = new GitWorktreeWorkspaceManager(repoRoot, 1);
  const workspace = await manager.allocate({ runId: 'run-ttl', tenantId: 'tenant-1', projectId: 'project-1' });

  await workspace.cleanup();
  const branches = await execFileAsync('git', ['branch', '--list', 'orchestrator/run-stale'], { cwd: repoRoot });
  assert.equal(branches.stdout.trim(), '');
  await rm(repoRoot, { recursive: true, force: true });
});

test('parsePrunedWorktreeCount parses different git prune output formats', () => {
  const fixtures = [
    {
      output: '',
      expected: 0,
    },
    {
      output: 'Removing /tmp/repo/.git/worktrees/run-1: gitdir file points to non-existent location',
      expected: 1,
    },
    {
      output: [
        'Pruning worktree /tmp/repo/.git/worktrees/run-2',
        'Pruning worktree /tmp/repo/.git/worktrees/run-3',
      ].join('\n'),
      expected: 2,
    },
    {
      output: [
        'prunable gitdir file points to non-existent location',
        'random informational line',
        'Removing /tmp/repo/.git/worktrees/run-4: stale',
      ].join('\n'),
      expected: 2,
    },
  ];

  for (const fixture of fixtures) {
    assert.equal(parsePrunedWorktreeCount(fixture.output), fixture.expected);
  }
});
