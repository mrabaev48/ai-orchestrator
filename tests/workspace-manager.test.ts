import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitWorktreeWorkspaceManager,
  parsePrunedWorktreeCount,
  StaticWorkspaceManager,
} from '@ai-orchestrator/execution';
import { createScratchGitRepo, gitEnv, removeScratchGitRepo } from './support/scratch-git-repo.js';

const execFileAsync = promisify(execFile);
const GIT_ENV = gitEnv();

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
  const repoRoot = await createScratchGitRepo('workspace-manager-repo');

  const manager = new GitWorktreeWorkspaceManager(repoRoot, 24);
  const workspace = await manager.allocate({ runId: 'run-42', tenantId: 'tenant-1', projectId: 'project-1' });

  const markerPath = path.join(workspace.rootPath, 'marker.txt');
  await writeFile(markerPath, 'changed', 'utf8');
  await workspace.rollback();

  await assert.rejects(async () => readFile(markerPath, 'utf8'));

  await workspace.cleanup();
  await removeScratchGitRepo(repoRoot);
});

test('GitWorktreeWorkspaceManager prunes stale orchestrator branches using ttl', async () => {
  const repoRoot = await createScratchGitRepo('workspace-manager-ttl-repo');
  await execFileAsync('git', ['checkout', '-b', 'orchestrator/run-stale'], { cwd: repoRoot, env: GIT_ENV });
  await execFileAsync('git', ['commit', '--allow-empty', '-m', 'stale'], {
    cwd: repoRoot,
    env: {
      ...GIT_ENV,
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    },
  });
  await execFileAsync('git', ['checkout', 'main'], { cwd: repoRoot, env: GIT_ENV });

  const manager = new GitWorktreeWorkspaceManager(repoRoot, 1);
  const workspace = await manager.allocate({ runId: 'run-ttl', tenantId: 'tenant-1', projectId: 'project-1' });

  await workspace.cleanup();
  const branches = await execFileAsync('git', ['branch', '--list', 'orchestrator/run-stale'], {
    cwd: repoRoot,
    env: GIT_ENV,
  });
  assert.equal(branches.stdout.trim(), '');
  await removeScratchGitRepo(repoRoot);
});

test('GitWorktreeWorkspaceManager serializes concurrent allocate/cleanup against the same repo', async () => {
  const repoRoot = await createScratchGitRepo('workspace-manager-concurrent-repo');
  const manager = new GitWorktreeWorkspaceManager(repoRoot, 24);
  const concurrency = 8;

  const workspaces = await Promise.all(
    Array.from({ length: concurrency }, async (_, index) =>
      manager.allocate({
        runId: `run-${index}`,
        tenantId: 'tenant-1',
        projectId: 'project-1',
      }),
    ),
  );

  const rootPaths = new Set(workspaces.map((workspace) => workspace.rootPath));
  assert.equal(rootPaths.size, concurrency, 'each allocate() call must get a distinct workspace root');

  await Promise.all(workspaces.map(async (workspace) => workspace.cleanup()));

  const worktreeList = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    env: GIT_ENV,
  });
  const worktreeCount = worktreeList.stdout
    .split('\n')
    .filter((line) => line.startsWith('worktree ')).length;
  assert.equal(worktreeCount, 1, 'only the main worktree should remain after concurrent cleanup');

  const branches = await execFileAsync('git', ['branch', '--list', 'orchestrator/run-*'], {
    cwd: repoRoot,
    env: GIT_ENV,
  });
  assert.equal(branches.stdout.trim(), '', 'no orchestrator/run-* branches should remain after concurrent cleanup');

  await removeScratchGitRepo(repoRoot);
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
