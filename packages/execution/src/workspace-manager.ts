import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface WorkspaceAllocationInput {
  runId: string;
  taskId?: string;
}

export interface ManagedWorkspace {
  rootPath: string;
  branchName?: string;
  initialDiff: string;
  rollback: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export interface WorkspaceManager {
  allocate: (input: WorkspaceAllocationInput) => Promise<ManagedWorkspace>;
}

export type WorkspaceManagerMode = 'git-worktree' | 'static';

export interface CreateWorkspaceManagerInput {
  mode: WorkspaceManagerMode;
  repoRoot: string;
  branchTtlHours: number;
}

const PRUNED_WORKTREE_PATTERNS = [/^Removing\s+/i, /^Pruning worktree\s+/i, /^prunable\s+/i];

export class WorkspaceManagerError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'WorkspaceManagerError';
    this.cause = cause;
  }
}

export class StaticWorkspaceManager implements WorkspaceManager {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  async allocate(input: WorkspaceAllocationInput): Promise<ManagedWorkspace> {
    void input;
    return {
      rootPath: this.rootPath,
      initialDiff: '',
      rollback: async () => {},
      cleanup: async () => {},
    };
  }
}

export class GitWorktreeWorkspaceManager implements WorkspaceManager {
  private readonly repoRoot: string;
  private readonly branchTtlHours: number;

  constructor(repoRoot: string, branchTtlHours: number) {
    this.repoRoot = path.resolve(repoRoot);
    this.branchTtlHours = branchTtlHours;
  }

  async allocate(input: WorkspaceAllocationInput): Promise<ManagedWorkspace> {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), `ai-orchestrator-${input.runId}-`));
    const timestamp = Date.now();
    const branchName = `orchestrator/run-${timestamp}-${input.runId}`;

    try {
      await this.cleanupStaleWorktreesAndBranches();
      const baseBranch = await this.currentBranch();
      await this.git(['worktree', 'add', '--detach', workspaceRoot, baseBranch], this.repoRoot);
      await this.git(['checkout', '-b', branchName], workspaceRoot);
      const initialDiff = await captureWorkspaceDiff(workspaceRoot);

      let isCleaned = false;
      const rollback = async (): Promise<void> => {
        await this.git(['reset', '--hard', 'HEAD'], workspaceRoot);
        await this.git(['clean', '-fd'], workspaceRoot);
      };
      const cleanup = async (): Promise<void> => {
        if (isCleaned) {
          return;
        }
        isCleaned = true;
        try {
          await this.git(['worktree', 'remove', '--force', workspaceRoot], this.repoRoot);
        } finally {
          await rm(workspaceRoot, { recursive: true, force: true });
          await this.git(['branch', '-D', branchName], this.repoRoot).catch(() => {});
        }
      };

      return {
        rootPath: workspaceRoot,
        branchName,
        initialDiff,
        rollback,
        cleanup,
      };
    } catch (error) {
      await rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
      throw new WorkspaceManagerError('Unable to allocate git worktree workspace', error);
    }
  }

  private async currentBranch(): Promise<string> {
    const { stdout } = await this.git(['branch', '--show-current'], this.repoRoot);
    const branch = stdout.trim();
    if (!branch) {
      throw new WorkspaceManagerError('Unable to resolve current git branch');
    }

    return branch;
  }

  private async git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    return await execFileAsync('git', args, { cwd });
  }

  private async cleanupStaleWorktreesAndBranches(): Promise<void> {
    const pruneWindow = `${this.branchTtlHours}.hours.ago`;
    await this.git(['worktree', 'prune', '--verbose', `--expire=${pruneWindow}`], this.repoRoot)
      .then((result) => parsePrunedWorktreeCount(result.stdout))
      .catch(() => {});
    const ttlSeconds = this.branchTtlHours * 60 * 60;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const refs = await this.git(
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(creatordate:unix)',
        'refs/heads/orchestrator/run-*',
      ],
      this.repoRoot,
    ).catch(() => ({ stdout: '', stderr: '' }));

    const staleBranches = refs.stdout
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        const [name, createdAtRaw] = line.split('\t');
        return { name, createdAtSeconds: Number.parseInt(createdAtRaw ?? '0', 10) };
      })
      .filter(
        (entry) =>
          typeof entry.name === 'string' &&
          entry.name.length > 0 &&
          Number.isFinite(entry.createdAtSeconds) &&
          entry.createdAtSeconds > 0 &&
          nowSeconds - entry.createdAtSeconds >= ttlSeconds,
      )
      .map((entry) => entry.name);

    for (const branchName of staleBranches) {
      if (!branchName) {
        continue;
      }
      await this.git(['branch', '-D', branchName], this.repoRoot).catch(() => {});
    }
  }
}

async function captureWorkspaceDiff(cwd: string): Promise<string> {
  const [status, diff] = await Promise.all([
    execFileAsync('git', ['status', '--short', '--untracked-files=all'], { cwd }),
    execFileAsync('git', ['diff', '--no-ext-diff'], { cwd }),
  ]);

  const chunks = [status.stdout.trim(), diff.stdout.trim()].filter((entry) => entry.length > 0);
  return chunks.join('\n\n');
}

export function createWorkspaceManager(input: CreateWorkspaceManagerInput): WorkspaceManager {
  if (input.mode === 'static') {
    return new StaticWorkspaceManager(input.repoRoot);
  }

  return new GitWorktreeWorkspaceManager(input.repoRoot, input.branchTtlHours);
}

export function parsePrunedWorktreeCount(output: string): number {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => PRUNED_WORKTREE_PATTERNS.some((pattern) => pattern.test(line)))
    .length;
}
