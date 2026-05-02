import { StateIntegrityError } from '../../shared/src/index.ts';
import {
  getAllowedRunStepTransitions,
  TERMINAL_RUN_STEP_STATUSES,
  type RunStepStatus,
} from './run-step-transition-table.ts';

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

  const allowed = getAllowedRunStepTransitions(input.previousStatus);
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
