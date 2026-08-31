/**
 * Builds an environment for spawning `git` subprocesses that strips any
 * inherited `GIT_*` variables (GIT_DIR, GIT_INDEX_FILE, GIT_WORK_TREE,
 * GIT_OBJECT_DIRECTORY, GIT_COMMON_DIR, GIT_PREFIX, ...).
 *
 * Git sets these when invoking hooks (e.g. a `.githooks/pre-commit` running
 * this project's own test suite during `git commit`). If left inherited,
 * any `git` subprocess spawned by our own code — regardless of its `cwd` —
 * resolves paths like `GIT_INDEX_FILE` (often a *relative* path such as
 * `.git/index`) against that inherited value instead of discovering the
 * repo from `cwd`. Inside a `git worktree` checkout, `.git` is a plain file
 * (a gitlink), not a directory, so resolving `.git/index` under it fails
 * with `fatal: .git/index: index file open failed: Not a directory` — the
 * exact failure this fixes. Always spawn `git` subprocesses with this env
 * so repo context comes only from `cwd`.
 */
export function gitSubprocessEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (key.startsWith('GIT_') || value === undefined) {
      continue;
    }
    clean[key] = value;
  }
  return clean;
}
