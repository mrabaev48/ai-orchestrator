import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultExecutionPolicyEngine } from '../packages/core/src/execution-policy-engine.ts';
import { computeRunStepChecksum, createEmptyProjectState, type RunStepLogEntry } from '../packages/core/src/index.ts';
import { completeSideEffect, reserveSideEffect } from '../packages/execution/src/idempotency/side-effect-dedup-guard.ts';
import { StepCancelledError, StepTimeoutError, createLogger } from '../packages/shared/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/in-memory/InMemoryStateStore.ts';

const logger = createLogger({
  llm: { provider: 'mock', model: 'm', temperature: 0, timeoutMs: 500 },
  state: { backend: 'memory', postgresDsn: '', postgresSchema: 'public', snapshotOnBootstrap: true, snapshotOnTaskCompletion: true, snapshotOnMilestoneCompletion: true },
  workflow: { maxStepsPerRun: 3, maxRetriesPerTask: 2 },
  tools: { allowedWritePaths: [process.cwd()], typescriptDiagnosticsEnabled: true, allowedShellCommands: ['node'], persistToolEvidence: true },
  logging: { level: 'error', format: 'json' },
}, { sink: () => {} });

function makeRunStep(overrides: Partial<RunStepLogEntry>): RunStepLogEntry {
  const base: RunStepLogEntry = {
    id: 'evidence-1',
    runId: 'run-baseline',
    stepId: 'step-1',
    role: 'coder',
    status: 'succeeded',
    createdAt: '2026-01-01T00:00:00.000Z',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    attempt: 1,
    idempotencyKey: 'key-1',
    traceId: 'trace-1',
    checksum: '',
    input: '{}',
    output: '{}',
    durationMs: 1,
  };

  const step = { ...base, ...overrides };
  step.checksum = computeRunStepChecksum({
    evidenceId: step.id,
    tenantId: step.tenantId,
    projectId: step.projectId,
    runId: step.runId,
    stepId: step.stepId,
    attempt: step.attempt,
    status: step.status,
    ...(step.policyDecisionId ? { policyDecisionId: step.policyDecisionId } : {}),
    idempotencyKey: step.idempotencyKey,
    createdAt: step.createdAt,
    ...(step.payloadRef ? { payloadRef: step.payloadRef } : {}),
    ...(step.prevChecksum ? { prevChecksum: step.prevChecksum } : {}),
    traceId: step.traceId,
  });
  return step;
}

test('baseline-invariants: success path policy decisions remain deterministic', () => {
  const ctx = defaultExecutionPolicyEngine.resolve({
    runId: 'run-1',
    role: 'coder',
    stateSummary: 'summary',
    workspaceRoot: '/tmp/workspace',
    allowedWritePaths: ['/tmp/workspace'],
    evidenceSource: 'runtime_events',
    logger,
  });

  assert.equal(ctx.toolExecution.policy, 'orchestrator_default');
  assert.equal(ctx.toolProfile.canWriteRepo, true);
  assert.deepEqual(ctx.policyRules?.requiredChecks, ['lint', 'typecheck']);
});

test('baseline-invariants: policy deny path keeps write access disabled for read-only roles', () => {
  const ctx = defaultExecutionPolicyEngine.resolve({
    runId: 'run-2',
    role: 'planner',
    stateSummary: 'summary',
    workspaceRoot: '/tmp/workspace',
    allowedWritePaths: ['/tmp/workspace'],
    evidenceSource: 'runtime_events',
    logger,
  });

  assert.equal(ctx.toolProfile.canWriteRepo, false);
  assert.deepEqual(ctx.toolProfile.allowedWritePaths, []);
  assert.equal(ctx.toolExecution.permissionScope, 'read_only');
});

test('baseline-invariants: dedup suppression prevents duplicate side effect execution', () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'P', summary: 'S' });
  const key = 'dedup-key-1';

  const first = reserveSideEffect(state.execution.dedupRegistry, {
    key,
    leaseOwner: 'run-1',
    nowIso: '2026-01-01T00:00:00.000Z',
    ttlMs: 60_000,
  });
  assert.deepEqual(first, { dedupSuppressed: false });

  completeSideEffect(state.execution.dedupRegistry, {
    key,
    nowIso: '2026-01-01T00:00:05.000Z',
    status: 'succeeded',
    policyDecisionId: 'policy-1',
    evidenceId: 'evidence-1',
  });

  const second = reserveSideEffect(state.execution.dedupRegistry, {
    key,
    leaseOwner: 'run-2',
    nowIso: '2026-01-01T00:00:07.000Z',
    ttlMs: 60_000,
  });
  assert.equal(second.dedupSuppressed, true);
});

test('baseline-invariants: timeout state is explicit and retry-safe', () => {
  const timeoutError = new StepTimeoutError('step timed out', {
    timeoutMs: 500,
    boundary: 'workflow_step',
    elapsedMs: 501,
  });

  assert.equal(timeoutError.code, 'WORKFLOW_POLICY_ERROR');
  assert.equal(timeoutError.retrySuggested, true);
  assert.deepEqual(timeoutError.toJSON().details, {
    code: 'STEP_TIMEOUT',
    timeoutMs: 500,
    boundary: 'workflow_step',
    elapsedMs: 501,
  });
});

test('baseline-invariants: cancellation mid-step preserves explicit propagation state', () => {
  const cancelled = new StepCancelledError('cancelled', {
    requestedBy: 'parent_signal',
    requestedAt: '2026-01-01T00:00:10.000Z',
    propagationState: 'cancelled',
  });

  assert.equal(cancelled.code, 'WORKFLOW_POLICY_ERROR');
  assert.equal(cancelled.retrySuggested, true);
  assert.deepEqual(cancelled.toJSON().details, {
    code: 'STEP_CANCELLED',
    requestedBy: 'parent_signal',
    requestedAt: '2026-01-01T00:00:10.000Z',
    propagationState: 'cancelled',
  });
});

test('baseline-invariants: evidence checksum integrity violations are detected', async () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'P', summary: 'S' });
  const step1 = makeRunStep({ stepId: 'step-1' });
  const step2 = makeRunStep({ stepId: 'step-2', prevChecksum: step1.checksum });
  state.execution.runStepLog = [step1, { ...step2, prevChecksum: 'tampered-checksum' }];

  const store = new InMemoryStateStore(state);
  await assert.rejects(async () => store.listRunSteps({ runId: 'run-baseline' }), /EVIDENCE_INTEGRITY_VIOLATION/);
});
