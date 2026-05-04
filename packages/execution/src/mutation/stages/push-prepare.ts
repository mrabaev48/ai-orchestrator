import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface PushPrepareStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  push?: (input: {
    workspacePath: string;
    branchName: string;
    signal?: AbortSignal;
  }) => Promise<{ remoteRef: string }>;
  pushDelete?: (input: {
    workspacePath: string;
    branchName: string;
    signal?: AbortSignal;
  }) => Promise<void>;
}

export async function executePushPrepareStage(input: PushPrepareStageInput): Promise<RepoMutationStageResult> {
  if (!input.context.branchName) {
    return {
      ok: false,
      failure: {
        code: 'PUSH_PREPARE_BRANCH_REQUIRED',
        message: 'Branch name is required for push_prepare stage',
        retriable: false,
      },
    };
  }

  const push =
    input.push ??
    (async () => {
      throw new Error('Push executor is not configured');
    });

  try {
    const result = await push({
      workspacePath: input.context.workspacePath,
      branchName: input.context.branchName,
      signal: input.signal,
    });

    return {
      ok: true,
      notes: 'git_push_completed',
      metadata: {
        branchName: input.context.branchName,
        remoteRef: result.remoteRef,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'PUSH_PREPARE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown push prepare failure',
        retriable: true,
      },
    };
  }
}

export async function compensatePushPrepareStage(
  context: RepoMutationPipelineContext,
  input: {
    signal?: AbortSignal;
    pushDelete?: (args: { workspacePath: string; branchName: string; signal?: AbortSignal }) => Promise<void>;
  } = {},
): Promise<void> {
  if (!context.branchName) {
    return;
  }

  const pushDelete =
    input.pushDelete ??
    (async () => {
      throw new Error('Push compensation executor is not configured');
    });

  await pushDelete({
    workspacePath: context.workspacePath,
    branchName: context.branchName,
    ...(input.signal ? { signal: input.signal } : {}),
  });
}
