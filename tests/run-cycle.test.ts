import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CoderRole,
  PromptEngineerRole,
  ReviewerRole,
  RoleRegistry,
  TaskManagerRole,
  TesterRole,
} from '@ai-orchestrator/agents';
import {
  buildIdempotencyKey,
  classifyExecutionPolicyActionRisk,
  createEmptyProjectState,
  type CodeExecutionOutput,
} from '@ai-orchestrator/core';
import {
  GitLifecycleCoordinator,
  Orchestrator,
  PolicyDecisionRecorder,
  runWithTimeout,
  type ExecutionLeaseAuthority,
  type ExecutionLeaseHandle,
} from '@ai-orchestrator/execution';
import { SchemaValidationError, WorkflowPolicyError } from '@ai-orchestrator/shared';
import { InMemoryObservabilityStore, InMemoryStateStore } from '@ai-orchestrator/state';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import type {
  AgentRole,
  RoleExecutionContext,
  RoleObservation,
  RoleRequest,
  RoleResponse,
  RoleStepResult,
} from '@ai-orchestrator/core';

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1000,
    },
    state: {
      backend: 'memory',
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask: 2,
      qualityGateMode: 'synthetic',
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeApprovalRuntimeConfig(): RuntimeConfig {
  return {
    ...makeRuntimeConfig(),
    workflow: {
      ...makeRuntimeConfig().workflow,
      approvalGateMode: 'enabled',
    },
  };
}

function makeRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

function makeState(acceptanceCriteria: string[] = ['done']): ReturnType<typeof createEmptyProjectState> {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Implement runtime block',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria,
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };
  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature 1',
    outcome: 'Outcome',
    risks: [],
    taskIds: ['task-1'],
  };
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic 1',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  return state;
}

function makeCodeExecutionOutput(summary: string): CodeExecutionOutput {
  return {
    changed: true,
    summary,
    changedFiles: ['packages/execution'],
    evidence: [{ type: 'tool_observation', description: 'Test role produced explicit execution evidence' }],
  };
}

function makeLeaseHandle(overrides: Partial<ExecutionLeaseHandle> = {}): ExecutionLeaseHandle {
  const lease = {
    resource: 'default-org:p1:global-run-cycle',
    ownerId: 'run-1',
    fencingToken: 1,
    acquiredAtIso: '2026-01-01T00:00:00.000Z',
    expiresAtIso: '2026-01-01T00:01:00.000Z',
  };
  return {
    resource: lease.resource,
    ownerId: lease.ownerId,
    lease,
    renew: async () => ({ renewed: true, lease }),
    validate: async () => ({ valid: true, lease }),
    requireValid: async () => {},
    release: async () => {},
    ...overrides,
  };
}

function makeGitLifecycleTestHarness(input: {
  state?: ReturnType<typeof makeState>;
  config?: RuntimeConfig;
  workspaceHasGitChanges: boolean;
  currentGitBranch?: string;
  createCommit?: () => Promise<{ ok: true; commitSha: string } | { ok: false }>;
  pushBranch?: () => Promise<boolean>;
  createPullRequestDraft?: () => Promise<boolean>;
}) {
  const state = input.state ?? makeState();
  const store = new InMemoryStateStore(state);
  const coordinator = new GitLifecycleCoordinator({
    stateStore: store,
    config: input.config ?? makeRuntimeConfig(),
    policyDecisionRecorder: new PolicyDecisionRecorder(store),
    executors: {
      workspaceHasGitChanges: async () => input.workspaceHasGitChanges,
      currentGitBranch: async () => input.currentGitBranch ?? 'task-1-run-test',
      createCommit: input.createCommit,
      pushBranch: input.pushBranch,
      createPullRequestDraft: input.createPullRequestDraft,
    },
  });
  return { coordinator, state, store };
}

test('runCycle happy path completes task and records summary artifact', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();

  assert.equal(result.status, 'completed');
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.execution.completedTaskIds.includes('task-1'), true);
  assert.equal(state.artifacts.some((artifact) => artifact.type === 'run_summary'), true);
  assert.equal(
    state.artifacts.some(
      (artifact) =>
        artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'branch' && artifact.metadata.taskId === 'task-1',
    ),
    true,
  );
  assert.equal(
    state.artifacts.some(
      (artifact) =>
        artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'commit' && artifact.metadata.runId === result.runId,
    ),
    true,
  );
  assert.equal(
    state.artifacts.some(
      (artifact) =>
        artifact.type === 'run_summary'
        && artifact.metadata.runId === result.runId
        && artifact.metadata.estimatedCostUsdMicro !== undefined
        && artifact.metadata.estimationMethod === 'heuristic_chars_div_4',
    ),
    true,
  );
  assert.equal(
    state.artifacts.some(
      (artifact) =>
        artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'pr_draft' && artifact.metadata.taskId === 'task-1',
    ),
    true,
  );
  const commitArtifact = state.artifacts.find(
    (artifact) => artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'commit',
  );
  const prArtifact = state.artifacts.find(
    (artifact) => artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'pr_draft',
  );
  assert.equal(commitArtifact?.metadata.commitStatus, 'skipped_no_changes');
  assert.equal(prArtifact?.metadata.prStatus, 'skipped_push_not_successful');
  assert.equal(state.repoHealth.build, 'passing');
  assert.equal(state.repoHealth.lint, 'passing');
  assert.equal(state.repoHealth.typecheck, 'passing');
  assert.equal(state.repoHealth.tests, 'passing');
  assert.equal(
    state.artifacts.some((artifact) => artifact.title.includes('Quality stage build for task-1')),
    true,
  );
});

test('runCycle persists failing quality stage diagnostics and updates repo health', async () => {
  const store = new InMemoryStateStore(makeState(['[fail-lint]']));
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();
  const lintArtifact = state.artifacts.find((artifact) =>
    artifact.title.includes('Quality stage lint for task-1')
  );

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'test_failed');
  assert.equal(state.repoHealth.tests, 'failing');
  assert.equal(state.repoHealth.lint, 'failing');
  assert.equal(state.repoHealth.build, 'passing');
  assert.equal(state.repoHealth.typecheck, 'passing');
  assert.equal(lintArtifact?.metadata.status, 'failing');
  assert.equal(
    (lintArtifact?.metadata.diagnostics ?? '').includes('acceptance marker [fail-lint]'),
    true,
  );
});

test('runCycle requests approval for risky git lifecycle actions when approval gate is enabled', async () => {
  const { coordinator, state } = makeGitLifecycleTestHarness({
    config: makeApprovalRuntimeConfig(),
    workspaceHasGitChanges: true,
    createCommit: async () => ({ ok: true, commitSha: 'abc123' }),
    pushBranch: async () => true,
  });

  const result = await coordinator.complete({
    state,
    runId: 'run-1',
    taskId: 'task-1',
    taskTitle: state.backlog.tasks['task-1']?.title ?? 'task',
    workspaceRoot: process.cwd(),
  });

  assert.equal(result, 'approval_pending');
  assert.equal(state.approvals.length > 0, true);
  assert.equal(state.approvals[0]?.requestedAction, 'git_push');
  assert.equal(state.approvals[0]?.status, 'pending');
});



test('runCycle persists policy decisions with risk levels from classification matrix for git side effects', async () => {
  const { coordinator, state } = makeGitLifecycleTestHarness({
    workspaceHasGitChanges: true,
    createCommit: async () => ({ ok: true, commitSha: 'abc123' }),
    pushBranch: async () => true,
    createPullRequestDraft: async () => true,
  });

  await coordinator.complete({
    state,
    runId: 'run-1',
    taskId: 'task-1',
    taskTitle: state.backlog.tasks['task-1']?.title ?? 'task',
    workspaceRoot: process.cwd(),
  });

  const expectedActions = ['git_commit', 'git_push', 'pr_draft'] as const;
  for (const actionType of expectedActions) {
    const decision = state.policyDecisions.find((entry) => entry.actionType === actionType);
    assert.ok(decision, `policy decision for ${actionType} must be persisted`);
    assert.equal(decision?.riskLevel, classifyExecutionPolicyActionRisk(actionType).riskLevel);
  }
});

test('runCycle skips git push side effect when dedup registry already has succeeded push entry', async () => {
  const state = makeState();
  const runId = '11111111-1111-1111-1111-111111111111';
  const branchName = 'task-1-run-test';
  const commitSha = 'abc123';
  const pushDedupKey = buildIdempotencyKey({
    tenantId: state.orgId,
    projectId: state.projectId,
    runId,
    taskId: 'task-1',
    stage: 'git_push',
    attempt: 0,
    sideEffectType: 'git_push',
    normalizedInput: `${branchName}|${commitSha}`,
  });
  state.execution.dedupRegistry[pushDedupKey] = {
    key: pushDedupKey,
    status: 'succeeded',
    leaseOwner: runId,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  let pushCalls = 0;
  const { coordinator, store } = makeGitLifecycleTestHarness({
    state,
    workspaceHasGitChanges: true,
    currentGitBranch: branchName,
    createCommit: async () => ({ ok: true, commitSha }),
    pushBranch: async () => {
      pushCalls += 1;
      return true;
    },
  });

  const resultStatus = await coordinator.complete({
    state,
    runId,
    taskId: 'task-1',
    taskTitle: state.backlog.tasks['task-1']?.title ?? 'task',
    workspaceRoot: process.cwd(),
  });
  const loaded = await store.load();
  const commitArtifact = loaded.artifacts.find(
    (artifact) => artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'commit',
  );
  const prArtifact = loaded.artifacts.find(
    (artifact) => artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'pr_draft',
  );

  assert.equal(pushCalls, 0);
  assert.equal(resultStatus, 'ok');
  assert.equal(commitArtifact?.metadata.pushStatus, 'skipped_duplicate');
  assert.equal(prArtifact?.metadata.prStatus, 'skipped_push_not_successful');
});

test('runCycle skips PR draft side effect when dedup registry already has succeeded PR entry', async () => {
  const state = makeState();
  const runId = '11111111-1111-1111-1111-111111111111';
  const branchName = 'task-1-run-test';
  const commitSha = 'abc123';
  const taskTitle = state.backlog.tasks['task-1']?.title ?? 'task';
  const prTitle = `[task-1] ${taskTitle}`;
  const prDedupKey = buildIdempotencyKey({
    tenantId: state.orgId,
    projectId: state.projectId,
    runId,
    taskId: 'task-1',
    stage: 'pr_draft',
    attempt: 0,
    sideEffectType: 'pr_draft',
    normalizedInput: `${branchName}|${prTitle}`,
  });
  state.execution.dedupRegistry[prDedupKey] = {
    key: prDedupKey,
    status: 'succeeded',
    leaseOwner: runId,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  let prCalls = 0;
  const { coordinator, store } = makeGitLifecycleTestHarness({
    state,
    workspaceHasGitChanges: true,
    currentGitBranch: branchName,
    createCommit: async () => ({ ok: true, commitSha }),
    pushBranch: async () => true,
    createPullRequestDraft: async () => {
      prCalls += 1;
      return true;
    },
  });

  const resultStatus = await coordinator.complete({
    state,
    runId,
    taskId: 'task-1',
    taskTitle,
    workspaceRoot: process.cwd(),
  });
  const loaded = await store.load();
  const prArtifact = loaded.artifacts.find(
    (artifact) => artifact.type === 'git_lifecycle' && artifact.metadata.stage === 'pr_draft',
  );

  assert.equal(prCalls, 0);
  assert.equal(resultStatus, 'ok');
  assert.equal(prArtifact?.metadata.prStatus, 'skipped_duplicate');
});
test('runCycle blocks task after repeated review failures', async () => {
  const state = makeState(['[reject] review should fail']);
  state.backlog.tasks['task-1']!.splitFromTaskId = 'parent-task';
  state.backlog.tasks['parent-task'] = {
    id: 'parent-task',
    featureId: 'feature-1',
    title: 'Parent task',
    kind: 'implementation',
    status: 'blocked',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };
  state.execution.retryCounts['task-1'] = 1;
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const loaded = await store.load();

  assert.equal(result.status, 'blocked');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'blocked');
  assert.equal(loaded.execution.blockedTaskIds.includes('task-1'), true);
  assert.equal(loaded.failures.length, 1);
  assert.equal(loaded.failures[0]?.status, 'dead_lettered');
  assert.equal(loaded.failures[0]?.checkpointRunId, result.runId);
});

test('runCycle splits parent task after repeated review failures', async () => {
  const state = makeState(['[reject] review should fail', 'keep scope narrow']);
  state.backlog.tasks['task-2'] = {
    id: 'task-2',
    featureId: 'feature-1',
    title: 'Follow-up task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: ['task-1'],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'low',
  };
  state.backlog.features['feature-1']?.taskIds.push('task-2');
  state.execution.retryCounts['task-1'] = 1;
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const loaded = await store.load();

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'task_split');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'superseded');
  assert.equal(loaded.execution.blockedTaskIds.includes('task-1'), false);
  assert.equal(loaded.backlog.tasks['task-1--part-1']?.splitFromTaskId, 'task-1');
  assert.equal(loaded.backlog.tasks['task-1--part-2']?.dependsOn[0], 'task-1--part-1');
  assert.equal(loaded.backlog.tasks['task-2']?.dependsOn[0], 'task-1--part-2');
  assert.equal(loaded.decisions.some((decision) => decision.title.includes('Split task task-1')), true);
  assert.equal(store.events.some((event) => event.eventType === 'TASK_SPLIT'), true);
});

test('runCycle executes forced task when it is executable', async () => {
  const state = makeState();
  state.backlog.tasks['task-2'] = {
    id: 'task-2',
    featureId: 'feature-1',
    title: 'Second executable task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'low',
  };
  state.backlog.features['feature-1']?.taskIds.push('task-2');

  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle({ forcedTaskId: 'task-2' });
  const loaded = await store.load();

  assert.equal(result.status, 'completed');
  assert.equal(result.taskId, 'task-2');
  assert.equal(loaded.backlog.tasks['task-2']?.status, 'done');
});

test('runCycle returns idle for non-executable forced task', async () => {
  const state = makeState();
  state.backlog.tasks['blocked-task'] = {
    id: 'blocked-task',
    featureId: 'feature-1',
    title: 'Blocked task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: ['task-1'],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'low',
  };
  state.backlog.features['feature-1']?.taskIds.push('blocked-task');

  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle({ forcedTaskId: 'blocked-task' });
  const loaded = await store.load();

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'forced_task_not_executable');
  assert.equal(loaded.backlog.tasks['blocked-task']?.status, 'todo');
});

test('runCycle returns deterministic idle reason when global run lock is unavailable', async () => {
  const store = new InMemoryStateStore(makeState());
  const observabilityStore = new InMemoryObservabilityStore();
  const records: Record<string, unknown>[] = [];
  const config = makeRuntimeConfig();
  config.logging.level = 'info';
  const logger = createLogger(config, {
    sink: (record) => {
      records.push(JSON.parse(record) as Record<string, unknown>);
    },
  });
  const executionLeaseAuthority: ExecutionLeaseAuthority = {
    acquireRunLease: async () => null,
  };
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger, {
    executionLeaseAuthority,
    observabilityStore,
  });

  const result = await orchestrator.runCycle();
  const idleRecord = records.find((record) => record.event === 'cycle_idle_lock_unavailable');
  const metricRecord = observabilityStore.metrics.find((record) => record.name === 'run_lock_contention_total');
  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'run_lock_unavailable');
  assert.equal(typeof result.runId, 'string');
  assert.notEqual(idleRecord, undefined);
  assert.equal(idleRecord?.message, 'Run cycle skipped because global run lock is unavailable');
  assert.notEqual(metricRecord, undefined);
  assert.equal(metricRecord?.metricType, 'counter');
  assert.equal(metricRecord?.value, 1);
  assert.equal(metricRecord?.tags.lock_resource, 'global-run-cycle');
  assert.equal(typeof metricRecord?.tags.runId, 'string');
});

test('runSingleTask executes the requested task when executable', async () => {
  const state = makeState();
  state.backlog.tasks['task-2'] = {
    id: 'task-2',
    featureId: 'feature-1',
    title: 'Second executable task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'low',
  };
  state.backlog.features['feature-1']?.taskIds.push('task-2');

  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runSingleTask('task-2');
  const loaded = await store.load();

  assert.equal(result.status, 'completed');
  assert.equal(result.taskId, 'task-2');
  assert.equal(loaded.backlog.tasks['task-2']?.status, 'done');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'todo');
});

test('runSingleTask throws deterministic error for invalid task id', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  await assert.rejects(
    async () => orchestrator.runSingleTask('missing-task'),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.details !== undefined &&
      typeof error.details === 'object' &&
      (error.details as Record<string, unknown>).reason === 'invalid_task_id',
  );
});

test('runSingleTask throws deterministic error for done task', async () => {
  const state = makeState();
  state.backlog.tasks['task-1']!.status = 'done';
  state.execution.completedTaskIds.push('task-1');
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  await assert.rejects(
    async () => orchestrator.runSingleTask('task-1'),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.details !== undefined &&
      typeof error.details === 'object' &&
      (error.details as Record<string, unknown>).reason === 'task_done',
  );
});

test('runSingleTask throws deterministic error for blocked task', async () => {
  const state = makeState();
  state.backlog.tasks['task-1']!.status = 'blocked';
  state.execution.blockedTaskIds.push('task-1');
  state.failures.push({
    id: 'failure-1',
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'blocked_for_test',
    symptoms: [],
    badPatterns: [],
    retrySuggested: false,
    createdAt: new Date().toISOString(),
  });
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  await assert.rejects(
    async () => orchestrator.runSingleTask('task-1'),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.details !== undefined &&
      typeof error.details === 'object' &&
      (error.details as Record<string, unknown>).reason === 'task_blocked',
  );
});

test('runCycle returns idle when distributed run lock is unavailable', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger, {
    executionLeaseAuthority: {
      acquireRunLease: async () => null,
    },
  });

  const result = await orchestrator.runCycle();
  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'run_lock_unavailable');
});

test('runCycle returns idle when execution lease is unavailable', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const executionLeaseAuthority: ExecutionLeaseAuthority = { acquireRunLease: async () => null };
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger, {
    executionLeaseAuthority,
  });

  const result = await orchestrator.runCycle();
  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'run_lock_unavailable');
});

test('runCycle fails when execution lease validation fails before execution', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const executionLeaseAuthority: ExecutionLeaseAuthority = {
    acquireRunLease: async () => makeLeaseHandle({
      requireValid: async () => {
        throw new WorkflowPolicyError('Execution lease is no longer valid', {
          details: { reason: 'stale_fencing_token' },
        });
      },
    }),
  };
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger, {
    executionLeaseAuthority,
  });

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) => error instanceof WorkflowPolicyError
      && error.message.includes('Execution lease is no longer valid'),
  );
});

test('runCycle renews execution lease during long-running work', async () => {
  const store = new InMemoryStateStore(makeState());
  const config = makeRuntimeConfig();
  config.workflow.fencingTtlMs = 2;
  const logger = createLogger(config, { sink: () => {} });
  let renewCount = 0;
  const executionLeaseAuthority: ExecutionLeaseAuthority = {
    acquireRunLease: async () => makeLeaseHandle({
      renew: async () => {
        renewCount += 1;
        const lease = makeLeaseHandle().lease;
        return { renewed: true, lease };
      },
      requireValid: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
    }),
  };
  const orchestrator = new Orchestrator(store, makeRegistry(), config, logger, {
    executionLeaseAuthority,
  });

  const result = await orchestrator.runCycle();

  assert.equal(result.status, 'completed');
  assert.equal(renewCount > 0, true);
});

test('runCycle rejects invalid coder output via role output schema registry', async () => {
  class InvalidCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(
      request: RoleRequest<{ task: unknown; prompt: unknown }>,
      context: RoleExecutionContext,
    ): Promise<RoleResponse<CodeExecutionOutput>> {
      void request;
      void context;
      return {
        role: 'coder',
        summary: 'invalid-output',
        output: { changed: true, summary: '' } as unknown as CodeExecutionOutput,
        warnings: [],
        risks: [],
        needsHumanDecision: false,
        confidence: 0.8,
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new InvalidCoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, makeRuntimeConfig(), logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) => error instanceof SchemaValidationError,
  );
});

test('runCycle provides tool execution context with policy, permission scope, workspace, and evidence source', async () => {
  class ContextAwareCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      return {
        role: 'coder',
        summary: 'context checked',
        output: makeCodeExecutionOutput('implemented'),
        warnings: [],
        risks: [],
        needsHumanDecision: false,
        confidence: 0.9,
      };
    }
  }

  class ContextAwareTesterRole implements AgentRole<{ task: unknown; result: unknown }, { passed: boolean; testPlan: string[]; evidence: string[]; failures: string[]; missingCoverage: string[] }> {
    readonly name = 'tester' as const;

    async execute(
      request: RoleRequest<{ task: unknown; result: unknown }>,
      context: RoleExecutionContext,
    ): Promise<RoleResponse<{ passed: boolean; testPlan: string[]; evidence: string[]; failures: string[]; missingCoverage: string[] }>> {
      void request;
      assert.equal(context.toolExecution.policy, 'quality_gate');
      assert.equal(context.toolExecution.permissionScope, 'test_execution');
      assert.equal(context.toolExecution.evidenceSource, 'runtime_events');
      assert.equal(context.toolExecution.qualityGateMode, 'synthetic');

      return {
        role: 'tester',
        summary: 'tests passed',
        output: {
          passed: true,
          testPlan: ['run tests'],
          evidence: ['tests green'],
          failures: [],
          missingCoverage: [],
        },
        warnings: [],
        risks: [],
        needsHumanDecision: false,
        confidence: 0.9,
      };
    }
  }

  class ContextAwareReviewerRole implements AgentRole<{ task: unknown; result: unknown }, { approved: boolean; blockingIssues: string[]; nonBlockingSuggestions: string[]; missingTests: string[]; notes: string[] }> {
    readonly name = 'reviewer' as const;

    async execute(
      request: RoleRequest<{ task: unknown; result: unknown }>,
      context: RoleExecutionContext,
    ): Promise<RoleResponse<{ approved: boolean; blockingIssues: string[]; nonBlockingSuggestions: string[]; missingTests: string[]; notes: string[] }>> {
      void request;
      assert.equal(context.toolExecution.policy, 'read_only_analysis');
      assert.equal(context.toolExecution.permissionScope, 'read_only');
      assert.equal(context.toolExecution.evidenceSource, 'runtime_events');

      return {
        role: 'reviewer',
        summary: 'review approved',
        output: {
          approved: true,
          blockingIssues: [],
          nonBlockingSuggestions: [],
          missingTests: [],
          notes: [],
        },
        warnings: [],
        risks: [],
        needsHumanDecision: false,
        confidence: 0.9,
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new ContextAwareCoderRole());
  registry.register(new ContextAwareReviewerRole());
  registry.register(new ContextAwareTesterRole());

  const state = makeState();
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();

  assert.equal(result.status, 'completed');
});

test('runCycle supports think-act-observe loop with tool_request and final_output', async () => {
  class LoopingCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(
      request: RoleRequest<{ task: unknown; prompt: unknown }>,
      context: RoleExecutionContext,
      observations: readonly RoleObservation[],
    ): Promise<RoleStepResult<CodeExecutionOutput>> {
      void request;
      void context;
      if (observations.length === 0) {
        return {
          type: 'tool_request',
          request: {
            toolName: 'git_status',
            input: {},
            rationale: 'Inspect workspace changes before finalizing.',
          },
        };
      }

      return {
        type: 'final_output',
        response: {
          role: 'coder',
          summary: 'completed with observations',
          output: makeCodeExecutionOutput('Observed git status before finishing'),
          warnings: [],
          risks: [],
          needsHumanDecision: false,
          confidence: 0.9,
        },
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new LoopingCoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();

  assert.equal(result.status, 'completed');
  assert.equal(store.events.some((event) => event.eventType === 'ROLE_TOOL_REQUESTED'), true);
  assert.equal(store.events.some((event) => event.eventType === 'ROLE_OBSERVATION_RECORDED'), true);
  const state = await store.load();
  assert.equal(state.execution.runStepLog.length > 0, true);
  assert.equal(state.execution.runStepLog.some((stepEntry) => stepEntry.tool === 'git_status'), true);
  assert.equal(state.execution.runStepLog.every((stepEntry) => stepEntry.durationMs >= 0), true);
  assert.equal(
    store.events.some(
      (event) => {
        if (event.eventType !== 'TOOL_EVIDENCE_RECORDED') {
          return false;
        }
        if (typeof event.payload !== 'object' || event.payload === null) {
          return false;
        }
        return 'toolName' in event.payload && event.payload.toolName === 'git_status';
      },
    ),
    true,
  );
});

test('runCycle fails when role action loop exceeds max step limit', async () => {
  class EndlessToolRequesterRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(): Promise<RoleStepResult<CodeExecutionOutput>> {
      return {
        type: 'tool_request',
        request: {
          toolName: 'git_status',
          input: {},
          rationale: 'Continue collecting status forever',
        },
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new EndlessToolRequesterRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const config = makeRuntimeConfig();
  config.workflow.maxStepsPerRun = 10;
  config.workflow.maxRoleStepsPerTask = 2;

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, config, logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.message.includes('exceeded action loop step limit'),
  );
});


test('runCycle fails when role action loop exceeds wall-time budget', async () => {
  class SlowToolRequesterRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(): Promise<RoleStepResult<CodeExecutionOutput>> {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {
        type: 'tool_request',
        request: {
          toolName: 'git_status',
          input: {},
          rationale: 'Collect workspace status with bounded budget',
        },
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new SlowToolRequesterRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const config = makeRuntimeConfig();
  config.workflow.maxStepsPerRun = 10;
  config.workflow.maxRoleStepsPerTask = 10;
  config.workflow.maxRoleWallTimeMs = 25;

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, config, logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.message.includes('exhausted action loop wall-time budget'),
  );
});

test('runCycle skips tool evidence artifacts when persistToolEvidence is disabled', async () => {
  class LoopingCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(
      request: RoleRequest<{ task: unknown; prompt: unknown }>,
      context: RoleExecutionContext,
      observations: readonly RoleObservation[],
    ): Promise<RoleStepResult<CodeExecutionOutput>> {
      void request;
      void context;
      if (observations.length === 0) {
        return {
          type: 'tool_request',
          request: {
            toolName: 'git_status',
            input: {},
            rationale: 'Inspect workspace changes before finalizing.',
          },
        };
      }

      return {
        type: 'final_output',
        response: {
          role: 'coder',
          summary: 'completed',
          output: makeCodeExecutionOutput('done'),
          warnings: [],
          risks: [],
          needsHumanDecision: false,
          confidence: 0.9,
        },
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new LoopingCoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const config = makeRuntimeConfig();
  config.tools.persistToolEvidence = false;

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, config, logger);

  await orchestrator.runCycle();

  assert.equal(store.events.some((event) => event.eventType === 'TOOL_EVIDENCE_RECORDED'), false);
});

test('runCycle fails when role step exceeds timeout budget', async () => {
  class SlowLoopingCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(): Promise<RoleStepResult<CodeExecutionOutput>> {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        type: 'final_output',
        response: {
          role: 'coder',
          summary: 'too slow',
          output: makeCodeExecutionOutput('slow'),
          warnings: [],
          risks: [],
          needsHumanDecision: false,
          confidence: 0.9,
        },
      };
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new SlowLoopingCoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const config = makeRuntimeConfig();
  config.llm.timeoutMs = 10;

  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, config, logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) =>
      error instanceof WorkflowPolicyError &&
      error.message.includes('timed out'),
  );
});

test('runCycle propagates abort signal into role step for cooperative cancellation', async () => {
  let isAbortObserved = false;

  class AbortAwareCoderRole implements AgentRole<{ task: unknown; prompt: unknown }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called when executeStep is available');
    }

    async executeStep(
      request: RoleRequest<{ task: unknown; prompt: unknown }>,
      context: RoleExecutionContext,
    ): Promise<RoleStepResult<CodeExecutionOutput>> {
      void request;
      await new Promise<never>((_, reject) => {
        context.abortSignal?.addEventListener(
          'abort',
          () => {
            isAbortObserved = true;
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          },
          { once: true },
        );
      });

      throw new Error('unreachable');
    }
  }

  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new AbortAwareCoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const config = makeRuntimeConfig();
  config.llm.timeoutMs = 10;
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, registry, config, logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) => error instanceof WorkflowPolicyError,
  );
  assert.equal(isAbortObserved, true);
});

test('runCycle enforces token budget before executing role', async () => {
  const config = makeRuntimeConfig();
  config.llm.tokenBudgetPerTask = 1;
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(config, { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), config, logger);

  await assert.rejects(
    async () => orchestrator.runCycle(),
    (error: unknown) => error instanceof WorkflowPolicyError
      && error.message.includes('Token budget exceeded for task'),
  );
});

test('runWithTimeout surfaces STEP_TIMEOUT details', async () => {
  await assert.rejects(
    async () =>
      runWithTimeout(
        async () => new Promise((resolve) => { setTimeout(() => { resolve('ok'); }, 50); }),
        10,
        'timeout expected',
      ),
    (error: unknown) => {
      assert.equal(error instanceof WorkflowPolicyError, true);
      const details = (error as WorkflowPolicyError).details as Record<string, unknown>;
      assert.equal(details.code, 'STEP_TIMEOUT');
      assert.equal(details.boundary, 'workflow_step');
      assert.equal(typeof details.timeoutMs, 'number');
      return true;
    },
  );
});

test('runWithTimeout surfaces STEP_CANCELLED details for parent cancellation', async () => {
  const controller = new AbortController();
  controller.abort(new Error('stop'));

  await assert.rejects(
    async () => runWithTimeout(async () => 'ok', 20, 'cancel expected', { parentSignal: controller.signal }),
    (error: unknown) => {
      assert.equal(error instanceof WorkflowPolicyError, true);
      const details = (error as WorkflowPolicyError).details as Record<string, unknown>;
      assert.equal(details.code, 'STEP_CANCELLED');
      assert.equal(details.propagationState, 'cancellation_requested');
      return true;
    },
  );
});
