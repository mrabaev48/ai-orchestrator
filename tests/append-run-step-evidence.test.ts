import test from 'node:test';
import assert from 'node:assert/strict';

import { appendRunStepEvidence } from '../packages/execution/src/evidence/append-run-step-evidence.ts';
import { createRunStepEvidenceStore, InMemoryStateStore } from '../packages/state/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';

function makeStore() {
  return new InMemoryStateStore(createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project 1',
    summary: 'summary',
  }));
}

test('appendRunStepEvidence appends entry with computed checksum', async () => {
  const stateStore = makeStore();
  const evidenceStore = createRunStepEvidenceStore(stateStore);

  const step = await appendRunStepEvidence(evidenceStore, {
    evidenceId: 'ev-1', tenantId: 'default-org', projectId: 'proj-1', runId: 'run-1', stepId: 'step-1', attempt: 0,
    role: 'tester', input: 'in', output: 'out', status: 'succeeded', idempotencyKey: 'run-1:step-1:0', traceId: 'run-1', durationMs: 10, createdAt: new Date().toISOString(),
  });

  assert.equal(step.checksum.length, 64);
  const listed = await stateStore.listRunSteps({ runId: 'run-1' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.checksum, step.checksum);
});

test('appendRunStepEvidence preserves previous checksum linkage', async () => {
  const stateStore = makeStore();
  const evidenceStore = createRunStepEvidenceStore(stateStore);
  const now = Date.now();

  const first = await appendRunStepEvidence(evidenceStore, {
    evidenceId: 'ev-1', tenantId: 'default-org', projectId: 'proj-1', runId: 'run-2', stepId: 'step-1', attempt: 0,
    role: 'tester', input: 'in', output: 'out', status: 'cancellation_requested', idempotencyKey: 'run-2:step-1:0', traceId: 'run-2', durationMs: 10, createdAt: new Date(now).toISOString(),
  });

  const second = await appendRunStepEvidence(evidenceStore, {
    evidenceId: 'ev-2', tenantId: 'default-org', projectId: 'proj-1', runId: 'run-2', stepId: 'step-1', attempt: 0,
    role: 'tester', input: 'in', output: 'out', status: 'cancelled', idempotencyKey: 'run-2:step-1:0', prevChecksum: first.checksum, traceId: 'run-2', durationMs: 10, createdAt: new Date(now + 1000).toISOString(),
  });

  assert.equal(second.prevChecksum, first.checksum);
});
