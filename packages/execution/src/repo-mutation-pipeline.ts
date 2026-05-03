export type RepoMutationStageName =
  | 'workspace_prepare'
  | 'branch_prepare'
  | 'change_apply'
  | 'verification'
  | 'commit_prepare'
  | 'push_prepare'
  | 'pr_draft_prepare'
  | 'finalize';

export type RepoMutationStageStatus = 'succeeded' | 'failed' | 'compensated' | 'skipped';

export interface RepoMutationStageEvidence {
  stage: RepoMutationStageName;
  status: RepoMutationStageStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempt: number;
  notes?: string;
  metadata?: Record<string, string>;
  errorCode?: string;
  errorMessage?: string;
}

export interface RepoMutationPipelineContext {
  runId: string;
  taskId: string;
  workspacePath: string;
  branchName?: string;
  metadata: Record<string, string>;
}

export interface StageFailure {
  code: string;
  message: string;
  retriable: boolean;
}

export interface RepoMutationStageResult {
  ok: boolean;
  notes?: string;
  metadata?: Record<string, string>;
  failure?: StageFailure;
}

export interface RepoMutationStageDefinition {
  name: RepoMutationStageName;
  timeoutMs: number;
  maxAttempts: number;
  execute: (context: RepoMutationPipelineContext, signal: AbortSignal) => Promise<RepoMutationStageResult>;
  compensate?: (context: RepoMutationPipelineContext) => Promise<void>;
}

export interface RepoMutationPipelineInput {
  context: RepoMutationPipelineContext;
  stages: RepoMutationStageDefinition[];
}

class StageTimeoutError extends Error {
  readonly stage: RepoMutationStageName;
  readonly timeoutMs: number;

  constructor(stage: RepoMutationStageName, timeoutMs: number) {
    super(`Stage ${stage} timed out after ${timeoutMs}ms`);
    this.name = 'StageTimeoutError';
    this.stage = stage;
    this.timeoutMs = timeoutMs;
  }
}

export interface RepoMutationPipelineResult {
  ok: boolean;
  stoppedAt?: RepoMutationStageName;
  evidences: RepoMutationStageEvidence[];
}

const STAGE_ORDER: RepoMutationStageName[] = [
  'workspace_prepare',
  'branch_prepare',
  'change_apply',
  'verification',
  'commit_prepare',
  'push_prepare',
  'pr_draft_prepare',
  'finalize',
];

export class RepoMutationPipeline {
  async run(input: RepoMutationPipelineInput): Promise<RepoMutationPipelineResult> {
    const orderedStages = [...input.stages].sort((a, b) => STAGE_ORDER.indexOf(a.name) - STAGE_ORDER.indexOf(b.name));
    const evidences: RepoMutationStageEvidence[] = [];

    for (const stage of orderedStages) {
      let attempt = 0;
      while (attempt < stage.maxAttempts) {
        attempt += 1;
        const startedAt = Date.now();
        const abortController = new AbortController();
        const timeout = setTimeout(() => {
          abortController.abort(new StageTimeoutError(stage.name, stage.timeoutMs));
        }, stage.timeoutMs);

        try {
          const result = await Promise.race([
            stage.execute(input.context, abortController.signal),
            new Promise<never>((_, reject) => {
              const onAbort = () => {
                const reason = abortController.signal.reason;
                reject(reason instanceof Error ? reason : new StageTimeoutError(stage.name, stage.timeoutMs));
              };
              abortController.signal.addEventListener('abort', onAbort, { once: true });
            }),
          ]);
          clearTimeout(timeout);
          const finishedAt = Date.now();

          if (result.ok) {
            evidences.push({
              stage: stage.name,
              status: 'succeeded',
              startedAt: new Date(startedAt).toISOString(),
              finishedAt: new Date(finishedAt).toISOString(),
              durationMs: finishedAt - startedAt,
              attempt,
              ...(result.notes ? { notes: result.notes } : {}),
              ...(result.metadata ? { metadata: result.metadata } : {}),
            });
            break;
          }

          if (!result.failure) {
            throw new Error(`Stage ${stage.name} returned failed result without failure payload`);
          }

          const failedEvidence: RepoMutationStageEvidence = {
            stage: stage.name,
            status: 'failed',
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: finishedAt - startedAt,
            attempt,
            errorCode: result.failure.code,
            errorMessage: result.failure.message,
            ...(result.notes ? { notes: result.notes } : {}),
            ...(result.metadata ? { metadata: result.metadata } : {}),
          };

          const isLastAttempt = attempt >= stage.maxAttempts;
          if (!result.failure.retriable || isLastAttempt) {
            evidences.push(failedEvidence);
            await this.compensateIfNeeded(stage, input.context, evidences);
            return { ok: false, stoppedAt: stage.name, evidences };
          }

          evidences.push({ ...failedEvidence, status: 'skipped', notes: 'retry_scheduled' });
        } catch (error) {
          clearTimeout(timeout);
          const finishedAt = Date.now();
          const message = error instanceof Error ? error.message : 'unknown_error';
          const isStageTimeout = error instanceof StageTimeoutError;
          evidences.push({
            stage: stage.name,
            status: 'failed',
            startedAt: new Date(startedAt).toISOString(),
            finishedAt: new Date(finishedAt).toISOString(),
            durationMs: finishedAt - startedAt,
            attempt,
            errorCode: isStageTimeout || abortController.signal.aborted ? 'STAGE_TIMEOUT' : 'STAGE_EXCEPTION',
            errorMessage: message,
          });
          await this.compensateIfNeeded(stage, input.context, evidences);
          return { ok: false, stoppedAt: stage.name, evidences };
        }
      }
    }

    return { ok: true, evidences };
  }

  private async compensateIfNeeded(
    stage: RepoMutationStageDefinition,
    context: RepoMutationPipelineContext,
    evidences: RepoMutationStageEvidence[],
  ): Promise<void> {
    if (!stage.compensate) {
      return;
    }
    const startedAt = Date.now();
    await stage.compensate(context);
    const finishedAt = Date.now();
    evidences.push({
      stage: stage.name,
      status: 'compensated',
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      attempt: 1,
      notes: 'compensation_completed',
    });
  }
}
