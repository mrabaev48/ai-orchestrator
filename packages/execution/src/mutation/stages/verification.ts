import {
  runVerificationSuite,
  type VerificationGateCommand,
  type VerificationSuiteResult,
} from '../../../../tools/src/verification/run-verification-suite.ts';
import type { RepoMutationPipelineContext, RepoMutationStageResult } from '../../repo-mutation-pipeline.ts';

export interface VerificationStageInput {
  context: RepoMutationPipelineContext;
  signal: AbortSignal;
  commands?: VerificationGateCommand[];
  runSuite?: (input: {
    workspacePath: string;
    signal?: AbortSignal;
    commands?: VerificationGateCommand[];
  }) => Promise<VerificationSuiteResult>;
}

export async function executeVerificationStage(input: VerificationStageInput): Promise<RepoMutationStageResult> {
  const runSuite = input.runSuite ?? runVerificationSuite;

  try {
    const result = await runSuite({
      workspacePath: input.context.workspacePath,
      signal: input.signal,
      ...(input.commands ? { commands: input.commands } : {}),
    });

    const executedGates = result.evidences.map((entry) => entry.gate).join(',');
    const durationMs = result.evidences.reduce((total, entry) => total + entry.durationMs, 0);

    if (result.ok) {
      return {
        ok: true,
        notes: 'verification_suite_passed',
        metadata: {
          executedGates,
          executedGateCount: String(result.evidences.length),
          totalDurationMs: String(durationMs),
        },
      };
    }

    return {
      ok: false,
      notes: 'verification_suite_failed',
      metadata: {
        executedGates,
        executedGateCount: String(result.evidences.length),
        failedGate: result.failedGate ?? 'unknown',
      },
      failure: {
        code: 'VERIFICATION_GATE_FAILED',
        message: `Verification failed at gate ${result.failedGate ?? 'unknown'}`,
        retriable: false,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: 'VERIFICATION_STAGE_FAILED',
        message: error instanceof Error ? error.message : 'Unknown verification failure',
        retriable: true,
      },
    };
  }
}
