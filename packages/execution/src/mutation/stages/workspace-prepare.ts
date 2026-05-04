import { createWorkspaceSnapshot, WorkspaceSnapshotError, type WorkspaceSnapshotResult } from '../../../../tools/src/workspace/snapshot.ts';
import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface WorkspacePrepareStageInput {
  context: RepoMutationPipelineContext;
  snapshotRootPath: string;
  signal: AbortSignal;
  createSnapshot?: (input: {
    workspacePath: string;
    snapshotRootPath: string;
    snapshotId: string;
    signal?: AbortSignal;
  }) => Promise<WorkspaceSnapshotResult>;
}

export async function executeWorkspacePrepareStage(input: WorkspacePrepareStageInput): Promise<RepoMutationStageResult> {
  const createSnapshot = input.createSnapshot ?? createWorkspaceSnapshot;
  const snapshotId = `${input.context.runId}-${input.context.taskId}`;

  try {
    const snapshot = await createSnapshot({
      workspacePath: input.context.workspacePath,
      snapshotRootPath: input.snapshotRootPath,
      snapshotId,
      signal: input.signal,
    });

    return {
      ok: true,
      notes: 'workspace_snapshot_created',
      metadata: {
        snapshotPath: snapshot.snapshotPath,
        snapshotId,
        snapshotCreatedAt: snapshot.createdAt,
      },
    };
  } catch (error) {
    if (error instanceof WorkspaceSnapshotError) {
      return {
        ok: false,
        failure: {
          code: error.code,
          message: error.message,
          retriable: error.code === 'SNAPSHOT_FAILED',
        },
      };
    }

    return {
      ok: false,
      failure: {
        code: 'WORKSPACE_PREPARE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown workspace prepare failure',
        retriable: true,
      },
    };
  }
}
