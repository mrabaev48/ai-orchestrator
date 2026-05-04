import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface PrDraftPrepareStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  title: string;
  body: string;
  createDraftPr?: (input: {
    workspacePath: string;
    branchName: string;
    title: string;
    body: string;
    signal?: AbortSignal;
  }) => Promise<{ prNumber: number; prUrl: string }>;
}

export async function executePrDraftPrepareStage(input: PrDraftPrepareStageInput): Promise<RepoMutationStageResult> {
  if (!input.context.branchName) {
    return {
      ok: false,
      failure: {
        code: 'PR_DRAFT_PREPARE_BRANCH_REQUIRED',
        message: 'Branch name is required for pr_draft_prepare stage',
        retriable: false,
      },
    };
  }

  const createDraftPr =
    input.createDraftPr ??
    (async () => {
      throw new Error('PR draft executor is not configured');
    });

  try {
    const result = await createDraftPr({
      workspacePath: input.context.workspacePath,
      branchName: input.context.branchName,
      title: input.title,
      body: input.body,
      signal: input.signal,
    });

    return {
      ok: true,
      notes: 'draft_pr_created',
      metadata: {
        branchName: input.context.branchName,
        prNumber: String(result.prNumber),
        prUrl: result.prUrl,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'PR_DRAFT_PREPARE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown pr draft prepare failure',
        retriable: true,
      },
    };
  }
}
