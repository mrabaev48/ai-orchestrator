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
  initialDiff: string;
  rollback: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export interface WorkspaceManager {
  allocate: (input: WorkspaceAllocationInput) => Promise<ManagedWorkspace>;
}

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

  constructor(repoRoot: string) {
    this.repoRoot = path.resolve(repoRoot);
  }

  async allocate(input: WorkspaceAllocationInput): Promise<ManagedWorkspace> {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), `ai-orchestrator-${input.runId}-`));
    const branchName = `orchestrator/run-${input.runId}`;

    try {
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
}

async function captureWorkspaceDiff(cwd: string): Promise<string> {
  const [status, diff] = await Promise.all([
    execFileAsync('git', ['status', '--short', '--untracked-files=all'], { cwd }),
    execFileAsync('git', ['diff', '--no-ext-diff'], { cwd }),
  ]);

  const chunks = [status.stdout.trim(), diff.stdout.trim()].filter((entry) => entry.length > 0);
  return chunks.join('\n\n');
}

export function createWorkspaceManager(repoRoot: string): WorkspaceManager {
  return new GitWorktreeWorkspaceManager(repoRoot);
}
