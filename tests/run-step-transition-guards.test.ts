import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRunStepTransitionAllowed,
  getAllowedRunStepTransitions,
  RUN_STEP_TRANSITION_TABLE,
} from '../packages/core/src/index.ts';

test('run-step transition table is closed and explicit for every known status', () => {
  assert.deepEqual(Object.keys(RUN_STEP_TRANSITION_TABLE).sort(), [
    'cancellation_requested',
    'cancelled',
    'compensated',
    'compensation_pending',
    'failed',
    'succeeded',
    'timed_out',
  ]);

  assert.deepEqual(getAllowedRunStepTransitions('cancellation_requested'), ['cancelled', 'compensation_pending']);
  assert.deepEqual(getAllowedRunStepTransitions('compensation_pending'), ['compensated', 'failed']);
});

test('run-step transition guard allows documented non-terminal transitions', () => {
  assert.doesNotThrow(() => {
    assertRunStepTransitionAllowed({
      previousStatus: 'cancellation_requested',
      nextStatus: 'cancelled',
      runId: 'run-1',
      stepId: 'step-1',
      attempt: 0,
      evidenceId: 'ev-1',
    });
  });
});

test('run-step transition guard rejects illegal transitions from terminal statuses', () => {
  assert.throws(() => {
    assertRunStepTransitionAllowed({
      previousStatus: 'succeeded',
      nextStatus: 'failed',
      runId: 'run-1',
      stepId: 'step-1',
      attempt: 0,
      evidenceId: 'ev-2',
    });
  }, (error: unknown) => {
    assert.equal(typeof error, 'object');
    assert.equal((error as { code?: string }).code, 'STATE_INTEGRITY_ERROR');
    assert.equal(
      (error as { toJSON?: () => { details?: { code?: string } } }).toJSON?.().details?.code,
      'ILLEGAL_RUN_STEP_TRANSITION',
    );
    return true;
  });
});
