import type { RunStepLogEntry } from './project-state.ts';

export type RunStepStatus = RunStepLogEntry['status'];

export const TERMINAL_RUN_STEP_STATUSES: ReadonlySet<RunStepStatus> = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
  'compensated',
]);

export const RUN_STEP_TRANSITION_TABLE = {
  succeeded: [],
  failed: [],
  timed_out: [],
  cancelled: [],
  cancellation_requested: ['cancelled', 'compensation_pending'],
  compensation_pending: ['compensated', 'failed'],
  compensated: [],
} as const satisfies Readonly<Record<RunStepStatus, readonly RunStepStatus[]>>;

export function getAllowedRunStepTransitions(status: RunStepStatus): readonly RunStepStatus[] {
  return RUN_STEP_TRANSITION_TABLE[status];
}

