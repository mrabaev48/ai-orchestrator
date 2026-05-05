import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '@ai-orchestrator/core';
import { InMemoryStateStore } from '@ai-orchestrator/state';

import { RunStepRecorder } from './run-step-recorder.js';

test('RunStepRecorder records checksum chain and flushes once', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const recorder = new RunStepRecorder(store);

  recorder.startRun('run-1', { tenantId: state.orgId, projectId: state.projectId });
  await recorder.record({
    runId: 'run-1',
    taskId: 'task-1',
    role: 'coder',
    tool: 'role.execute',
    input: { prompt: 'a' },
    output: { summary: 'first' },
    status: 'succeeded',
    durationMs: 10,
  });
  await recorder.record({
    runId: 'run-1',
    taskId: 'task-1',
    role: 'coder',
    tool: 'git_status',
    input: {},
    output: { ok: true },
    status: 'succeeded',
    durationMs: 5,
  });

  recorder.flushToState(state);
  recorder.flushToState(state);

  assert.equal(state.execution.runStepLog.length, 2);
  assert.equal(state.execution.runStepLog[1]?.prevChecksum, state.execution.runStepLog[0]?.checksum);
  assert.equal(state.execution.runStepLog[0]?.tenantId, state.orgId);
});
