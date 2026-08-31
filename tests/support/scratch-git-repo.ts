import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Strips inherited GIT_* env vars (GIT_DIR, GIT_INDEX_FILE, ...) that git
// sets when invoking hooks, e.g. this project's own .githooks/pre-commit
// during `git commit`. Left inherited, a spawned `git` subprocess resolves
// repo context from those vars instead of `cwd`, which can point scratch
// repo operations back at the real ai-orchestrator checkout. Mirrors
// packages/execution/src/git/git-subprocess-env.ts (not reused directly to
// keep this test helper dependency-free of the execution package).
export function gitEnv(): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GIT_') || value === undefined) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

const execFileAsync = promisify(execFile);
const GIT_ENV = gitEnv();

/**
 * Creates a throwaway git repository under the OS temp directory, with a
 * single commit on `main`. Intentionally has no `origin` remote, so that if
 * any git-lifecycle code path is ever reached unmocked against this repo,
 * push/PR operations fail closed instead of touching a real remote.
 *
 * Never point production code or tests at the real ai-orchestrator checkout
 * for git-worktree/git-lifecycle exercises — use this helper instead.
 */
export async function createScratchGitRepo(prefix: string): Promise<string> {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: repoRoot, env: GIT_ENV });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot, env: GIT_ENV });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot, env: GIT_ENV });
  await writeFile(path.join(repoRoot, 'README.md'), '# scratch repo\n', 'utf8');
  await execFileAsync('git', ['add', '.'], { cwd: repoRoot, env: GIT_ENV });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: repoRoot, env: GIT_ENV });
  return repoRoot;
}

export async function removeScratchGitRepo(repoRoot: string): Promise<void> {
  await rm(repoRoot, { recursive: true, force: true });
}
