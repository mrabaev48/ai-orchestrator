import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface CommitPrepareStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  message: string;
  commit?: (input: {
    workspacePath: string;
    message: string;
    signal?: AbortSignal;
  }) => Promise<{ commitSha: string }>;
  resetHardHead?: (input: { workspacePath: string; signal?: AbortSignal }) => Promise<void>;
}

export async function executeCommitPrepareStage(input: CommitPrepareStageInput): Promise<RepoMutationStageResult> {
  const commit =
    input.commit ??
    (async () => {
      throw new Error('Commit executor is not configured');
    });

  try {
    const result = await commit({
      workspacePath: input.context.workspacePath,
      message: input.message,
      signal: input.signal,
    });

    return {
      ok: true,
      notes: 'git_commit_created',
      metadata: {
        commitSha: result.commitSha,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'COMMIT_PREPARE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown commit prepare failure',
        retriable: true,
      },
    };
  }
}

export async function compensateCommitPrepareStage(
  context: RepoMutationPipelineContext,
  input: {
    signal?: AbortSignal;
    resetHardHead?: (args: { workspacePath: string; signal?: AbortSignal }) => Promise<void>;
  } = {},
): Promise<void> {
  const resetHardHead =
    input.resetHardHead ??
    (async () => {
      throw new Error('Commit compensation executor is not configured');
    });

  await resetHardHead({ workspacePath: context.workspacePath, ...(input.signal ? { signal: input.signal } : {}) });
}
