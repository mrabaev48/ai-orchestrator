import { applyPatch, ApplyPatchError, type ApplyPatchDiagnostics } from '../../../../tools/src/patch/apply-patch.ts';
import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface ChangeApplyStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  patchText: string;
  patchApply?: (input: { workspacePath: string; patchText: string; signal?: AbortSignal }) => Promise<ApplyPatchDiagnostics>;
}

function buildFailure(code: string, message: string, retriable: boolean): RepoMutationStageResult {
  return {
    ok: false,
    failure: {
      code,
      message,
      retriable,
    },
  };
}

export async function executeChangeApplyStage(input: ChangeApplyStageInput): Promise<RepoMutationStageResult> {
  const patchApply = input.patchApply ?? applyPatch;

  try {
    const diagnostics = await patchApply({
      workspacePath: input.context.workspacePath,
      patchText: input.patchText,
      signal: input.signal,
    });

    return {
      ok: true,
      notes: 'patch_applied',
      metadata: {
        changedFiles: diagnostics.changedFiles.join(','),
        changedFilesCount: String(diagnostics.changedFiles.length),
      },
    };
  } catch (error) {
    if (error instanceof ApplyPatchError) {
      if (error.code === 'PATCH_TEXT_EMPTY') {
        return buildFailure(error.code, error.message, false);
      }
      if (error.code === 'PATCH_CANCELLED') {
        return buildFailure(error.code, error.message, false);
      }
      return buildFailure(error.code, error.message, true);
    }

    return buildFailure(
      'CHANGE_APPLY_FAILED',
      error instanceof Error ? error.message : 'Unknown change apply failure',
      true,
    );
  }
}
