import { StateIntegrityError } from '../../shared/src/index.ts';
import type { RunStepLogEntry } from './project-state.ts';

export type RunStepStatus = RunStepLogEntry['status'];

const TERMINAL_RUN_STEP_STATUSES: ReadonlySet<RunStepStatus> = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
  'compensated',
]);

const RUN_STEP_TRANSITIONS: Readonly<Record<RunStepStatus, readonly RunStepStatus[]>> = {
  succeeded: [],
  failed: [],
  timed_out: [],
  cancelled: [],
  cancellation_requested: ['cancelled', 'compensation_pending'],
  compensation_pending: ['compensated', 'failed'],
  compensated: [],
};

export function assertRunStepTransitionAllowed(input: {
  previousStatus?: RunStepStatus;
  nextStatus: RunStepStatus;
  runId: string;
  stepId: string;
  attempt: number;
  evidenceId: string;
}): void {
  if (!input.previousStatus) {
    return;
  }

  const allowed = RUN_STEP_TRANSITIONS[input.previousStatus] ?? [];
  if (allowed.includes(input.nextStatus)) {
    return;
  }

  throw new StateIntegrityError('Illegal run step status transition', {
    details: {
      code: 'ILLEGAL_RUN_STEP_TRANSITION',
      runId: input.runId,
      stepId: input.stepId,
      attempt: input.attempt,
      evidenceId: input.evidenceId,
      previousStatus: input.previousStatus,
      nextStatus: input.nextStatus,
      allowedNextStatuses: allowed,
      previousStatusTerminal: TERMINAL_RUN_STEP_STATUSES.has(input.previousStatus),
    },
  });
}
