import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface BranchPrepareStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  getCurrentBranch?: (input: { signal?: AbortSignal }) => Promise<string>;
  ensureBranch?: (input: { branchName: string; signal?: AbortSignal }) => Promise<{ created: boolean }>;
}

const BRANCH_PREFIX = 'mutation';
const BRANCH_REGEX = /^mutation\/[a-z0-9][a-z0-9-]*$/;

export function buildMutationBranchName(context: RepoMutationPipelineContext): string {
  const runPart = sanitizeBranchToken(context.runId);
  const taskPart = sanitizeBranchToken(context.taskId);
  return `${BRANCH_PREFIX}/${runPart}-${taskPart}`;
}

function sanitizeBranchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export async function executeBranchPrepareStage(input: BranchPrepareStageInput): Promise<RepoMutationStageResult> {
  const targetBranch = input.context.branchName ?? buildMutationBranchName(input.context);

  if (!BRANCH_REGEX.test(targetBranch)) {
    return {
      ok: false,
      failure: {
        code: 'BRANCH_POLICY_INVALID',
        message: `Branch name does not match policy: ${targetBranch}`,
        retriable: false,
      },
    };
  }

  try {
    const currentBranch = await input.getCurrentBranch?.({ signal: input.signal });
    if (typeof currentBranch === 'string' && currentBranch.trim() === targetBranch) {
      return {
        ok: true,
        notes: 'branch_prepare_already_on_target',
        metadata: { branchName: targetBranch, branchAction: 'noop' },
      };
    }

    const ensured = await input.ensureBranch?.({ branchName: targetBranch, signal: input.signal });
    input.context.branchName = targetBranch;

    return {
      ok: true,
      notes: ensured?.created === false ? 'branch_prepare_checked_out_existing' : 'branch_prepare_created',
      metadata: {
        branchName: targetBranch,
        branchAction: ensured?.created === false ? 'checkout_existing' : 'created',
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'BRANCH_PREPARE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown branch prepare failure',
        retriable: true,
      },
    };
  }
}
