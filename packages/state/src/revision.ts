import type { ProjectState } from '@ai-orchestrator/core';
import { StateStoreError } from '@ai-orchestrator/shared';

import type { StateWriteOptions } from './StateStore.js';

export const STATE_REVISION_CONFLICT = 'STATE_REVISION_CONFLICT';

export function expectedRevisionFor(state: ProjectState, options: StateWriteOptions = {}): number {
  const expectedRevision = options.expectedRevision ?? state.revision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new StateStoreError('Invalid state revision expectation', {
      details: { code: 'INVALID_STATE_REVISION', expectedRevision },
      retrySuggested: false,
    });
  }
  return expectedRevision;
}

export function stateRevisionConflict(expectedRevision: number, currentRevision: number): StateStoreError {
  return new StateStoreError('State revision conflict', {
    details: {
      code: STATE_REVISION_CONFLICT,
      expectedRevision,
      currentRevision,
    },
    retrySuggested: true,
  });
}

