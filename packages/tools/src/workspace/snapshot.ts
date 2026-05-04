import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface WorkspaceSnapshotInput {
  workspacePath: string;
  snapshotRootPath: string;
  snapshotId: string;
  signal?: AbortSignal;
}

export interface WorkspaceSnapshotResult {
  snapshotPath: string;
  createdAt: string;
}

export class WorkspaceSnapshotError extends Error {
  readonly code: 'WORKSPACE_NOT_FOUND' | 'SNAPSHOT_CANCELLED' | 'SNAPSHOT_FAILED';

  constructor(code: WorkspaceSnapshotError['code'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'WorkspaceSnapshotError';
    this.code = code;
  }
}

export async function createWorkspaceSnapshot(input: WorkspaceSnapshotInput): Promise<WorkspaceSnapshotResult> {
  if (input.signal?.aborted) {
    throw new WorkspaceSnapshotError('SNAPSHOT_CANCELLED', 'Workspace snapshot cancelled before start');
  }

  let workspaceStats;
  try {
    workspaceStats = await stat(input.workspacePath);
  } catch (error) {
    throw new WorkspaceSnapshotError(
      'WORKSPACE_NOT_FOUND',
      `Workspace path does not exist: ${input.workspacePath}`,
      { cause: error },
    );
  }

  if (!workspaceStats.isDirectory()) {
    throw new WorkspaceSnapshotError('WORKSPACE_NOT_FOUND', `Workspace path is not a directory: ${input.workspacePath}`);
  }

  const snapshotPath = path.join(input.snapshotRootPath, input.snapshotId);
  try {
    await mkdir(input.snapshotRootPath, { recursive: true });
    if (input.signal?.aborted) {
      throw new WorkspaceSnapshotError('SNAPSHOT_CANCELLED', 'Workspace snapshot cancelled during copy');
    }
    await cp(input.workspacePath, snapshotPath, {
      recursive: true,
      force: true,
      errorOnExist: false,
      preserveTimestamps: true
    });
  } catch (error) {
    if (input.signal?.aborted) {
      throw new WorkspaceSnapshotError('SNAPSHOT_CANCELLED', 'Workspace snapshot cancelled during copy', { cause: error });
    }
    throw new WorkspaceSnapshotError('SNAPSHOT_FAILED', `Workspace snapshot failed: ${snapshotPath}`, { cause: error });
  }

  return {
    snapshotPath,
    createdAt: new Date().toISOString(),
  };
}
