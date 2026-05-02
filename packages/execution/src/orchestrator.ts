import { buildIdempotencyKey, type ApprovalRequest, type ArtifactRecord, type BacklogTask, type ExecutionPolicyActionType, type ProjectState } from '../../core/src/index.ts';
import {
  assertProjectState,
  computeRunStepChecksum,
  formatPolicyDecisionError,
  isExecutableTask,
  makeEvent,
  classifyExecutionPolicyActionRisk,
  classifyApprovalRequestedActionRisk,
} from '../../core/src/index.ts';
import {
  defaultExecutionPolicyEngine,
  defaultRoleOutputSchemaRegistry,
  validateRoleResponse,
} from '../../core/src/index.ts';
import type { Logger, RuntimeConfig } from '../../shared/src/index.ts';
import { SchemaValidationError, StepCancelledError, StepTimeoutError, WorkflowPolicyError } from '../../shared/src/index.ts';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { StateStore } from '../../state/src/index.ts';
import type { ToolSet } from '../../tools/src/index.ts';
import { createLocalToolSet } from '../../tools/src/index.ts';
import { createLockAuthority, type LockAuthority } from './lock-authority.ts';
import { StateStoreExecutionTelemetry, type ExecutionTelemetry } from './telemetry.ts';
import { buildPreflightPolicyGateDecisionRequest } from './gates/preflight-policy-gate.ts';
import { buildPostflightPolicyGateDecisionRequest } from './finalize/postflight-policy.ts';
import { buildStepPolicyGateRequest } from './steps/step-policy-gate.ts';
import {
  createWorkspaceManager,
  type ManagedWorkspace,
  type WorkspaceManager,
} from './workspace-manager.ts';
import { completeSideEffect, reserveSideEffect } from './idempotency/side-effect-dedup-guard.ts';
import {
  nextFailureAction,
  requiresReview,
  requiresTesting,
  routeTaskToRole,
  splitTaskForRetry,
  shouldStopRun,
} from '../../workflow/src/index.ts';
import type { RoleRegistry } from '../../agents/src/index.ts';
import type {
  AgentRole,
  RoleObservation,
  RoleExecutionContext,
  RoleRequest,
  RoleResponse,
  RoleStepResult,
  ToolCallRequest,
} from '../../core/src/roles.ts';
import type { RunStepLogEntry } from '../../core/src/index.ts';
import type { QualityStageResult } from '../../core/src/testing.ts';
const execFileAsync = promisify(execFile);

export interface RunCycleResult {
  runId: string;
  status: 'completed' | 'blocked' | 'idle';
  taskId?: string;
  stopReason?: string;
}

export interface RunCycleOptions {
  forcedTaskId?: string;
  abortSignal?: AbortSignal;
}

export type RunSingleTaskErrorReason =
  | 'invalid_task_id'
  | 'task_blocked'
  | 'task_done'
  | 'task_not_executable';

export class Orchestrator {
  private tools: ToolSet;
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly config: RuntimeConfig;
  private readonly logger: Logger;
  private readonly lockAuthority: LockAuthority;
  private readonly telemetry: ExecutionTelemetry;
  private readonly workspaceManager: WorkspaceManager;
  private currentRunStepBuffer: RunStepLogEntry[] | null = null;
  private currentRunChecksumByRunId = new Map<string, string>();
  private currentEvidenceTenantId: string | null = null;
  private currentEvidenceProjectId: string | null = null;
  private currentRunTokenEstimate = 0;
  private currentTaskTokenEstimate = 0;
  private currentRunCostUsdMicro = 0;
  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    config: RuntimeConfig,
    logger: Logger,
    overrides?: { lockAuthority?: LockAuthority; telemetry?: ExecutionTelemetry; workspaceManager?: WorkspaceManager },
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.config = config;
    this.logger = logger;
    const toolPolicyConfig = {
      allowedWritePaths: config.tools.allowedWritePaths,
      allowedShellCommands: config.tools.allowedShellCommands,
      ...(config.tools.writeMode ? { writeMode: config.tools.writeMode } : {}),
      ...(config.tools.protectedWritePaths ? { protectedWritePaths: config.tools.protectedWritePaths } : {}),
      ...(typeof config.tools.maxModifiedFiles === 'number'
        ? { maxModifiedFiles: config.tools.maxModifiedFiles }
        : {}),
    };
    this.tools = createLocalToolSet(toolPolicyConfig);
    this.lockAuthority = overrides?.lockAuthority ?? createLockAuthority(config);
    this.telemetry = overrides?.telemetry ?? new StateStoreExecutionTelemetry(stateStore, logger);
    this.workspaceManager = overrides?.workspaceManager
      ?? createWorkspaceManager({
        mode: config.workflow.workspaceManagerMode ?? 'git-worktree',
        repoRoot: config.tools.allowedWritePaths[0] ?? process.cwd(),
        branchTtlHours: config.workflow.workspaceBranchTtlHours ?? 24,
      });
  }

  async runCycle(options: RunCycleOptions = {}): Promise<RunCycleResult> {
    this.currentRunTokenEstimate = 0;
    this.currentRunCostUsdMicro = 0;
    const lockHandle = await this.lockAuthority.acquireRunLock('global-run-cycle');
    if (!lockHandle) {
      const runId = crypto.randomUUID();
      await this.telemetry.incrementCounter({
        name: 'run_lock_contention_total',
        value: 1,
        runId,
        tags: { lock_resource: 'global-run-cycle' },
      });
      this.logger.info('Run cycle skipped because global run lock is unavailable', {
        event: 'cycle_idle_lock_unavailable',
        runId,
        data: {
          resource: 'global-run-cycle',
          delta: 1,
        },
      });
      return {
        runId,
        status: 'idle',
        stopReason: 'run_lock_unavailable',
      };
    }

    try {
      const state = await this.stateStore.load();
      assertProjectState(state);

      const stop = shouldStopRun(state, this.config.workflow);
      if (stop.stop) {
        return {
          runId: state.execution.activeRunId ?? crypto.randomUUID(),
          status: 'idle',
          ...(stop.reason ? { stopReason: stop.reason } : {}),
        };
      }

      const runId = crypto.randomUUID();
      const task = options.forcedTaskId
        ? this.selectForcedTask(state, options.forcedTaskId)
        : await this.selectNextTask(state, runId);
      if (!task) {
        return {
          runId,
          status: 'idle',
          stopReason: options.forcedTaskId ? 'forced_task_not_executable' : 'no_executable_task',
        };
      }

      const workspace = await this.workspaceManager.allocate({ runId, taskId: task.id });
      const workspaceTools = createLocalToolSet({
        allowedWritePaths: [workspace.rootPath],
        allowedShellCommands: this.config.tools.allowedShellCommands,
        ...(this.config.tools.writeMode ? { writeMode: this.config.tools.writeMode } : {}),
        ...(this.config.tools.protectedWritePaths ? { protectedWritePaths: this.config.tools.protectedWritePaths } : {}),
        ...(typeof this.config.tools.maxModifiedFiles === 'number'
          ? { maxModifiedFiles: this.config.tools.maxModifiedFiles }
          : {}),
      });

      const workspaceArtifact = makeArtifact('report', `Workspace initialized for ${task.id}`, {
        runId,
        taskId: task.id,
        workspaceRoot: workspace.rootPath,
        hasInitialDiff: workspace.initialDiff.length > 0 ? 'true' : 'false',
      });
      await this.stateStore.recordArtifact(workspaceArtifact);
      state.artifacts.push(workspaceArtifact);
      await this.recordGitBranchArtifact(state, {
        runId,
        taskId: task.id,
        ...(workspace.branchName ? { branchName: workspace.branchName } : {}),
      });

      return await this.runTaskInWorkspace({
        state,
        task,
        runId,
        workspace,
        workspaceTools,
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
      });
    } finally {
      await lockHandle.release();
    }
  }

  async runSingleTask(taskId: string): Promise<RunCycleResult> {
    const state = await this.stateStore.load();
    assertProjectState(state);

    const task = state.backlog.tasks[taskId];
    if (!task) {
      throw this.makeRunSingleTaskError(taskId, 'invalid_task_id', 'Requested task does not exist');
    }

    if (task.status === 'done' || state.execution.completedTaskIds.includes(taskId)) {
      throw this.makeRunSingleTaskError(taskId, 'task_done', 'Requested task is already completed');
    }

    if (task.status === 'blocked' || state.execution.blockedTaskIds.includes(taskId)) {
      throw this.makeRunSingleTaskError(taskId, 'task_blocked', 'Requested task is blocked');
    }

    const completed = new Set(state.execution.completedTaskIds);
    const blocked = new Set(state.execution.blockedTaskIds);
    if (!isExecutableTask(completed, blocked, task)) {
      throw this.makeRunSingleTaskError(taskId, 'task_not_executable', 'Requested task is not executable');
    }

    return this.runCycle({ forcedTaskId: taskId });
  }


  private async runTaskInWorkspace(input: {
    state: ProjectState;
    task: BacklogTask;
    runId: string;
    workspace: ManagedWorkspace;
    workspaceTools: ToolSet;
    abortSignal?: AbortSignal;
  }): Promise<RunCycleResult> {
    const { state, task, runId, workspace, workspaceTools, abortSignal } = input;
    this.currentRunChecksumByRunId.delete(runId);
    this.currentEvidenceTenantId = state.orgId;
    this.currentEvidenceProjectId = state.projectId;
    const taskStartedAt = Date.now();
    let runOutcome: 'completed' | 'blocked' | 'failed' = 'failed';
    this.tools = workspaceTools;
    this.currentRunStepBuffer = [];
    this.currentTaskTokenEstimate = 0;
    try {
      state.execution.activeRunId = runId;
      state.execution.activeTaskId = task.id;
      await this.stateStore.recordEvent(makeEvent('TASK_SELECTED', { taskId: task.id }, { runId }));
      await this.persistAndRequirePolicyDecision(
        buildPreflightPolicyGateDecisionRequest({
          state,
          runId,
          task,
        }),
      );

    const failures = state.failures.filter((failure) => failure.taskId === task.id);
    const promptEngineer = this.roleRegistry.get<
      { task: BacklogTask; stateSummary: string; failures: typeof failures; outputSchema: Record<string, unknown> },
      { id: string; role: string; systemPrompt: string; taskPrompt: string; contextSummary: string; constraints: string[]; outputSchema: Record<string, unknown> }
    >('prompt_engineer');

      const promptResponse = await this.executeRole(promptEngineer, {
      role: 'prompt_engineer',
      objective: 'Optimize task prompt',
      input: {
        task,
        stateSummary: summarizeState(state),
        failures,
        outputSchema: defaultRoleOutputSchemaRegistry.getSchema(routeTaskToRole(task)),
      },
      acceptanceCriteria: ['Prompt includes acceptance criteria and failure constraints'],
      }, this.makeContext('prompt_engineer', runId, state, workspace.rootPath, task.id, abortSignal));

    await this.stateStore.recordEvent(makeEvent('PROMPT_GENERATED', { taskId: task.id, promptId: promptResponse.output.id }, { runId }));
    const optimizedPromptArtifact = makeArtifact('optimized_prompt', `Prompt for ${task.id}`, {
      taskId: task.id,
      promptId: promptResponse.output.id,
    });
    await this.stateStore.recordArtifact(optimizedPromptArtifact);
    state.artifacts.push(optimizedPromptArtifact);

    const roleName = routeTaskToRole(task);
    const executor = this.roleRegistry.get<
      { task: BacklogTask; prompt: typeof promptResponse.output },
      { changed: boolean; summary: string }
    >(roleName);

      const executionContext = this.makeContext(roleName, runId, state, workspace.rootPath, task.id, abortSignal);
      const executionResponse = await this.executeRole(executor, {
      role: roleName,
      objective: `Execute ${task.id}`,
      input: { task, prompt: promptResponse.output },
      acceptanceCriteria: task.acceptanceCriteria,
      }, executionContext);
    await this.enforceExecutionPolicy(workspace.rootPath, executionContext);

    await this.stateStore.recordEvent(makeEvent('ROLE_EXECUTED', { taskId: task.id, role: roleName }, { runId }));

    if (requiresReview(task)) {
      const reviewer = this.roleRegistry.get<
        { task: BacklogTask; result: typeof executionResponse.output },
        { approved: boolean; blockingIssues: string[]; nonBlockingSuggestions: string[]; missingTests: string[]; notes: string[] }
      >('reviewer');

        const review = await this.executeRole(reviewer, {
        role: 'reviewer',
        objective: `Review ${task.id}`,
        input: { task, result: executionResponse.output },
        acceptanceCriteria: ['Approve or return blocking issues'],
        }, this.makeContext('reviewer', runId, state, workspace.rootPath, task.id, abortSignal));

      if (!review.output.approved || review.output.blockingIssues.length > 0) {
        await this.stateStore.recordEvent(makeEvent('REVIEW_REJECTED', { taskId: task.id }, { runId }));
        return await this.handleFailure(state, task, 'reviewer', 'review_rejected', runId);
      }

      await this.stateStore.recordEvent(makeEvent('REVIEW_APPROVED', { taskId: task.id }, { runId }));
    }

    if (requiresTesting(task)) {
      const tester = this.roleRegistry.get<
        { task: BacklogTask; result: typeof executionResponse.output },
        {
          passed: boolean;
          testPlan: string[];
          evidence: string[];
          failures: string[];
          missingCoverage: string[];
          qualityStages?: QualityStageResult[];
        }
      >('tester');

        const testing = await this.executeRole(tester, {
        role: 'tester',
        objective: `Test ${task.id}`,
        input: { task, result: executionResponse.output },
        acceptanceCriteria: ['Return explicit evidence'],
        }, this.makeContext('tester', runId, state, workspace.rootPath, task.id, abortSignal));

      if (!testing.output.passed || testing.output.failures.length > 0) {
        this.applyRepoHealthFromTestingResult(state, testing.output.qualityStages, false);
        await this.persistQualityStageArtifacts(state, runId, task.id, testing.output.qualityStages);
        await this.stateStore.recordEvent(makeEvent('TEST_FAILED', { taskId: task.id }, { runId }));
        return await this.handleFailure(state, task, 'tester', 'test_failed', runId);
      }

      this.applyRepoHealthFromTestingResult(state, testing.output.qualityStages, true);
      this.enforceRequiredChecks(this.makeContext('tester', runId, state, workspace.rootPath, task.id, abortSignal), testing.output.qualityStages);
      await this.persistQualityStageArtifacts(state, runId, task.id, testing.output.qualityStages);
      await this.stateStore.recordEvent(makeEvent('TEST_PASSED', { taskId: task.id }, { runId }));
    }

    task.status = 'done';
    if (!state.execution.completedTaskIds.includes(task.id)) {
      state.execution.completedTaskIds.push(task.id);
    }
    delete state.execution.activeTaskId;
    state.execution.stepCount += 1;

    const taskSummaryArtifact = makeArtifact('run_summary', `Task ${task.id} completion summary`, {
      taskId: task.id,
      summary: executionResponse.output.summary,
    });
    const runSummaryArtifact = makeArtifact('run_summary', `Run summary for ${task.id}`, {
      runId,
      taskId: task.id,
      status: 'completed',
    });

    await this.stateStore.recordArtifact(taskSummaryArtifact);
    await this.stateStore.recordArtifact(runSummaryArtifact);
    state.artifacts.push(taskSummaryArtifact, runSummaryArtifact);
    const gitLifecycleStatus = await this.recordGitLifecycleCompletionArtifacts(state, {
      runId,
      taskId: task.id,
      taskTitle: task.title,
      workspaceRoot: workspace.rootPath,
      ...(workspace.branchName ? { branchName: workspace.branchName } : {}),
    });

    await this.persistAndRequirePolicyDecision(
      buildPostflightPolicyGateDecisionRequest({
        state,
        runId,
        task,
      }),
    );

    const stateCommittedEvent = makeEvent('STATE_COMMITTED', { taskId: task.id }, { runId });
    this.flushRunStepBufferToState(state);
    await this.stateStore.saveWithEvents(state, [stateCommittedEvent]);

    this.logger.info('Run cycle completed', {
      event: 'cycle_end',
      runId,
      taskId: task.id,
      result: 'ok',
    });

      const taskResult: RunCycleResult = {
        runId,
        taskId: task.id,
        status: gitLifecycleStatus === 'approval_pending' ? 'blocked' : 'completed',
        ...(gitLifecycleStatus === 'approval_pending' ? { stopReason: 'approval_pending' } : {}),
      };
      runOutcome = taskResult.status === 'blocked' ? 'blocked' : 'completed';
      await this.telemetry.incrementCounter({
        name: 'task_run_total',
        runId,
        tags: { taskId: task.id, status: taskResult.status },
      });
      await this.telemetry.recordHistogram({
        name: 'span_task_run_duration_ms',
        value: Date.now() - taskStartedAt,
        runId,
        tags: { taskId: task.id, status: taskResult.status, span: 'task_run' },
      });
      return taskResult;
    } catch (error) {
      await workspace.rollback().catch(() => {});
      throw error;
    } finally {
      await this.recordRunCostSummaryArtifact(state, runId, task.id, runOutcome);
      this.currentRunStepBuffer = null;
      await workspace.cleanup().catch(() => {});
    }
  }

  private async recordRunCostSummaryArtifact(
    state: ProjectState,
    runId: string,
    taskId: string,
    status: 'completed' | 'blocked' | 'failed',
  ): Promise<void> {
    const artifact = makeArtifact('run_summary', `Run cost summary for ${taskId}`, {
      runId,
      taskId,
      status,
      estimatedTokensRun: String(this.currentRunTokenEstimate),
      estimatedTokensTask: String(this.currentTaskTokenEstimate),
      estimatedCostUsdMicro: String(this.currentRunCostUsdMicro),
      estimationMethod: 'heuristic_chars_div_4',
    });
    await this.stateStore.recordArtifact(artifact).catch(() => {});
    state.artifacts.push(artifact);
  }

  private async enforceExecutionPolicy(workspaceRoot: string, context: RoleExecutionContext): Promise<void> {
    const rules = context.policyRules;
    if (!rules) {
      return;
    }
    const changedFiles = await this.listWorkspaceChangedFiles(workspaceRoot);
    if (rules.maxChangedFiles >= 0 && changedFiles.length > rules.maxChangedFiles) {
      throw new WorkflowPolicyError(
        `Policy maxChangedFiles exceeded for ${context.role}: ${changedFiles.length} > ${rules.maxChangedFiles}`,
      );
    }
    const forbiddenHit = changedFiles.find((filePath) =>
      rules.forbiddenDirectories.some((directory) =>
        filePath === directory || filePath.startsWith(`${directory}/`)
      )
    );
    if (forbiddenHit) {
      throw new WorkflowPolicyError(`Policy forbiddenDirectories violation for ${context.role}: ${forbiddenHit}`);
    }
  }

  private async listWorkspaceChangedFiles(workspaceRoot: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: workspaceRoot });
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 3)
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  private enforceRequiredChecks(
    context: RoleExecutionContext,
    qualityStages: readonly QualityStageResult[] | undefined,
  ): void {
    const requiredChecks = context.policyRules?.requiredChecks ?? [];
    if (requiredChecks.length === 0 || !qualityStages || qualityStages.length === 0) {
      return;
    }
    const passedStages = new Set(
      (qualityStages ?? []).filter((stage) => stage.status === 'passing').map((stage) => stage.stage),
    );
    const missing = requiredChecks.filter((check) => !passedStages.has(check as QualityStageResult['stage']));
    if (missing.length > 0) {
      throw new WorkflowPolicyError(`Policy requiredChecks not satisfied: ${missing.join(', ')}`);
    }
  }

  private applyRepoHealthFromTestingResult(
    state: ProjectState,
    qualityStages: readonly QualityStageResult[] | undefined,
    testsPassed: boolean,
  ): void {
    state.repoHealth.tests = testsPassed ? 'passing' : 'failing';
    if (!qualityStages) {
      return;
    }

    for (const stage of qualityStages) {
      if (stage.stage === 'test') {
        continue;
      }
      state.repoHealth[stage.stage] = stage.status;
    }
  }

  private async persistQualityStageArtifacts(
    state: ProjectState,
    runId: string,
    taskId: string,
    qualityStages: readonly QualityStageResult[] | undefined,
  ): Promise<void> {
    if (!qualityStages || qualityStages.length === 0) {
      return;
    }

    for (const stage of qualityStages) {
      const diagnostics = stage.diagnostics.length > 0 ? stage.diagnostics.join(' | ') : 'none';
      const artifact = makeArtifact('report', `Quality stage ${stage.stage} for ${taskId}`, {
        runId,
        taskId,
        stage: stage.stage,
        status: stage.status,
        diagnostics: truncateText(diagnostics, 250),
      });
      await this.stateStore.recordArtifact(artifact);
      state.artifacts.push(artifact);
    }
  }

  private async selectNextTask(state: ProjectState, runId: string): Promise<BacklogTask | null> {
    const taskManager = this.roleRegistry.get<{ state: ProjectState }, BacklogTask | null>('task_manager');
    const taskSelection = await this.executeRole(taskManager, {
      role: 'task_manager',
      objective: 'Select next executable task',
      input: { state },
      acceptanceCriteria: ['Return a single executable task or null'],
    }, this.makeContext('task_manager', runId, state, path.resolve(this.config.tools.allowedWritePaths[0] ?? process.cwd())));

    return taskSelection.output;
  }

  private selectForcedTask(state: ProjectState, taskId: string): BacklogTask | null {
    const task = state.backlog.tasks[taskId];
    if (!task) {
      this.logger.warn('Forced task does not exist', {
        event: 'forced_task_not_found',
        taskId,
      });
      return null;
    }

    const completed = new Set(state.execution.completedTaskIds);
    const blocked = new Set(state.execution.blockedTaskIds);
    if (!isExecutableTask(completed, blocked, task)) {
      this.logger.warn('Forced task is not executable', {
        event: 'forced_task_not_executable',
        taskId,
        reason: task.status,
      });
      return null;
    }

    return task;
  }

  private async handleFailure(
    state: ProjectState,
    task: BacklogTask,
    role: 'reviewer' | 'tester',
    reason: string,
    runId: string,
  ): Promise<RunCycleResult> {
    const retryCount = state.execution.retryCounts[task.id] ?? 0;
    const action = nextFailureAction(task, retryCount, this.config.workflow.maxRetriesPerTask);
    const now = new Date().toISOString();

    const failure = await this.stateStore.recordFailure({
      taskId: task.id,
      role,
      reason,
      retrySuggested: action !== 'block',
      status: action === 'block' ? 'dead_lettered' : 'retryable',
      checkpointRunId: runId,
      ...(action === 'block' ? { deadLetteredAt: now } : {}),
    });
    state.failures.push(failure);
    state.execution.retryCounts[task.id] = (state.execution.retryCounts[task.id] ?? 0) + 1;
    delete state.execution.activeTaskId;
    this.flushRunStepBufferToState(state);

    if (action === 'split') {
      const splitPlan = splitTaskForRetry(task, reason);
      task.status = 'superseded';
      state.execution.blockedTaskIds = state.execution.blockedTaskIds.filter(
        (taskId) => taskId !== task.id,
      );

      const feature = state.backlog.features[task.featureId];
      for (const childTask of splitPlan.childTasks) {
        state.backlog.tasks[childTask.id] = childTask;
        if (feature && !feature.taskIds.includes(childTask.id)) {
          feature.taskIds.push(childTask.id);
        }
      }
      rewriteSupersededDependencies(state, task.id, splitPlan.completionTaskId, splitPlan.childTasks);

      const artifact = makeArtifact('report', `Task split for ${task.id}`, {
        taskId: task.id,
        reason,
        childTaskIds: splitPlan.childTasks.map((childTask) => childTask.id).join(','),
      });
      const decision = {
        id: crypto.randomUUID(),
        title: `Split task ${task.id}`,
        decision: `Split ${task.id} into ${splitPlan.childTasks.map((childTask) => childTask.id).join(', ')}`,
        rationale: splitPlan.rationale,
        affectedAreas: [...task.affectedModules],
        createdAt: new Date().toISOString(),
      };
      state.artifacts.push(artifact);
      state.decisions.push(decision);
      const taskSplitEvent = makeEvent(
        'TASK_SPLIT',
        {
          taskId: task.id,
          childTaskIds: splitPlan.childTasks.map((childTask) => childTask.id),
          reason,
        },
        { runId },
      );
      await this.stateStore.saveWithEvents(state, [taskSplitEvent]);
      return { runId, taskId: task.id, status: 'idle', stopReason: 'task_split' };
    }

    if (action === 'block') {
      task.status = 'blocked';
      if (!state.execution.blockedTaskIds.includes(task.id)) {
        state.execution.blockedTaskIds.push(task.id);
      }
      const artifact = makeArtifact('report', `Escalation for ${task.id}`, {
        taskId: task.id,
        reason,
      });
      state.artifacts.push(artifact);
      await this.stateStore.recordArtifact(artifact);
      const taskBlockedEvent = makeEvent('TASK_BLOCKED', { taskId: task.id, reason }, { runId });
      await this.stateStore.saveWithEvents(state, [taskBlockedEvent]);
      return { runId, taskId: task.id, status: 'blocked', stopReason: reason };
    }

    await this.stateStore.save(state);
    return { runId, taskId: task.id, status: 'idle', stopReason: reason };
  }

  private makeContext(
    role: RoleExecutionContext['role'],
    runId: string,
    state: ProjectState,
    workspaceRoot: string,
    taskId?: string,
    abortSignal?: AbortSignal,
  ): RoleExecutionContext {
    return defaultExecutionPolicyEngine.resolve({
      role,
      runId,
      ...(taskId ? { taskId } : {}),
      stateSummary: summarizeState(state),
      workspaceRoot,
      allowedWritePaths: this.config.tools.allowedWritePaths,
      evidenceSource: taskId ? 'runtime_events' : 'state_snapshot',
      qualityGateMode: this.config.workflow.qualityGateMode ?? 'tooling',
      ...(abortSignal ? { abortSignal } : {}),
      logger: this.logger,
    });
  }

  private async executeRole<TInput, TOutput>(
    role: AgentRole<TInput, TOutput>,
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<TOutput>> {
    const startedAt = Date.now();
    const model = this.resolveModelForRole(request.role);
    await this.recordModelSelectionMetric(context.runId, request.role, model);
    this.enforceCostControlBudgets(model, request.role);
    const estimatedPromptTokens = estimateObservationTokens(request.input);
    await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedPromptTokens, 'role_request_estimate');
    const firstAttempt = await this.executeRoleWithLoop(role, request, context);
    try {
      await role.validate?.(firstAttempt);
      this.validateRoleResult(request.role, firstAttempt);
      await this.recordRunStep({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: role.name,
        tool: 'role.execute',
        input: request.input,
        output: firstAttempt.output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      const estimatedOutputTokens = estimateObservationTokens(firstAttempt.output);
      await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedOutputTokens, 'role_output_estimate');
      return firstAttempt;
    } catch {
      context.logger.warn('Role validation failed, retrying once', {
        event: 'schema_validation_retry',
      });
      const secondAttempt = await this.executeRoleWithLoop(role, request, context);
      try {
        await role.validate?.(secondAttempt);
        this.validateRoleResult(request.role, secondAttempt);
      } catch (validationError) {
        await this.recordRunStep({
          runId: context.runId,
          ...(context.taskId ? { taskId: context.taskId } : {}),
          role: role.name,
          tool: 'role.execute',
          input: request.input,
          output: validationError instanceof Error ? validationError.message : String(validationError),
          status: 'failed',
          durationMs: Date.now() - startedAt,
        });
        throw new SchemaValidationError('Role response schema validation failed', {
          cause: validationError,
          retrySuggested: false,
        });
      }
      await this.recordRunStep({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: role.name,
        tool: 'role.execute',
        input: request.input,
        output: secondAttempt.output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      const estimatedOutputTokens = estimateObservationTokens(secondAttempt.output);
      await this.recordTokenAndCostUsage(context.runId, request.role, model, estimatedOutputTokens, 'role_output_estimate');
      return secondAttempt;
    }
  }
  private resolveModelForRole(role: RoleExecutionContext['role']): string {
    const roleModel = this.config.llm.roleModels?.[role];
    if (roleModel) {
      return roleModel;
    }
    return this.config.llm.fallbackModel ?? this.config.llm.model;
  }

  private async recordModelSelectionMetric(runId: string, role: string, model: string): Promise<void> {
    await this.telemetry.incrementCounter({
      name: 'llm_model_selection_total',
      runId,
      tags: { role, model },
    });
  }

  private async recordTokenAndCostUsage(
    runId: string,
    role: string,
    model: string,
    tokenEstimate: number,
    source: string,
  ): Promise<void> {
    const safeEstimate = Math.max(0, tokenEstimate);
    this.currentRunTokenEstimate += safeEstimate;
    this.currentTaskTokenEstimate += safeEstimate;
    const modelCostPer1kTokensUsdMicro = this.config.llm.modelCostPer1kTokensUsdMicro?.[model] ?? 0;
    const estimatedCostUsdMicro = Math.ceil((safeEstimate / 1000) * modelCostPer1kTokensUsdMicro);
    this.currentRunCostUsdMicro += estimatedCostUsdMicro;
    await this.telemetry.incrementCounter({
      name: 'llm_token_estimate_total',
      value: safeEstimate,
      runId,
      tags: { role, model, source },
    });
    await this.telemetry.incrementCounter({
      name: 'run_cost_usd_micro_total',
      value: estimatedCostUsdMicro,
      runId,
      tags: { role, model, source },
    });
  }

  private enforceCostControlBudgets(model: string, role: string): void {
    const maxTaskTokens = this.config.llm.tokenBudgetPerTask;
    if (typeof maxTaskTokens === 'number' && this.currentTaskTokenEstimate >= maxTaskTokens) {
      throw new WorkflowPolicyError(`Token budget exceeded for task before role ${role} using model ${model}`, {
        details: { role, model, budgetType: 'task', tokenBudget: maxTaskTokens, observedTokens: this.currentTaskTokenEstimate },
        retrySuggested: false,
      });
    }
    const maxRunTokens = this.config.llm.tokenBudgetPerRun;
    if (typeof maxRunTokens === 'number' && this.currentRunTokenEstimate >= maxRunTokens) {
      throw new WorkflowPolicyError(`Token budget exceeded for run before role ${role} using model ${model}`, {
        details: { role, model, budgetType: 'run', tokenBudget: maxRunTokens, observedTokens: this.currentRunTokenEstimate },
        retrySuggested: false,
      });
    }
    const maxRunCostUsdMicro = this.config.llm.maxRunCostUsdMicro;
    if (typeof maxRunCostUsdMicro === 'number' && this.currentRunCostUsdMicro >= maxRunCostUsdMicro) {
      throw new WorkflowPolicyError(`Run cost budget exceeded before role ${role} using model ${model}`, {
        details: { role, model, budgetType: 'run_cost', costBudgetUsdMicro: maxRunCostUsdMicro, observedCostUsdMicro: this.currentRunCostUsdMicro },
        retrySuggested: false,
      });
    }
  }

  private async executeRoleWithLoop<TInput, TOutput>(
    role: AgentRole<TInput, TOutput>,
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<TOutput>> {
    if (!role.executeStep) {
      return this.runWithTimeout(
        async (signal) => role.execute(request, { ...context, abortSignal: signal }),
        this.config.llm.timeoutMs,
        `Role ${role.name} timed out while generating output`,
        withParentSignal(context.abortSignal),
      );
    }
    const executeStep = role.executeStep;

    const observations: RoleObservation[] = [];
    const stepLimit = Math.max(
      1,
      this.config.workflow.maxRoleStepsPerTask ?? this.config.workflow.maxStepsPerRun,
    );
    const roleStartedAt = Date.now();
    const roleWallTimeBudgetMs = this.config.workflow.maxRoleWallTimeMs;

    for (let step = 1; step <= stepLimit; step += 1) {
      const elapsedMs = Date.now() - roleStartedAt;
      if (typeof roleWallTimeBudgetMs === 'number' && elapsedMs >= roleWallTimeBudgetMs) {
        throw new WorkflowPolicyError(`Role ${role.name} exhausted action loop wall-time budget`, {
          details: {
            role: role.name,
            step,
            stopCondition: 'budget_exhausted',
            budgetType: 'wall_time_ms',
            elapsedMs,
            maxWallTimeMs: roleWallTimeBudgetMs,
          },
          retrySuggested: true,
        });
      }
      if (context.abortSignal?.aborted) {
        throw new WorkflowPolicyError(`Role ${role.name} cancelled before step ${step}`, {
          details: {
            role: role.name,
            step,
            reason: 'cancelled',
          },
          retrySuggested: true,
        });
      }

      const stepTimeoutMs = typeof roleWallTimeBudgetMs === 'number'
        ? Math.max(1, Math.min(this.config.llm.timeoutMs, roleWallTimeBudgetMs - elapsedMs))
        : this.config.llm.timeoutMs;
      const stepResult: RoleStepResult<TOutput> = await this.runWithTimeout(
        async (signal) => executeStep(request, { ...context, abortSignal: signal }, observations),
        stepTimeoutMs,
        `Role ${role.name} timed out at step ${step}`,
        withParentSignal(context.abortSignal),
      );

      if (stepResult.type === 'final_output') {
        return stepResult.response;
      }

      await this.stateStore.recordEvent(
        makeEvent(
          'ROLE_TOOL_REQUESTED',
          {
            role: role.name,
            taskId: context.taskId ?? null,
            step,
            toolName: stepResult.request.toolName,
            rationale: stepResult.request.rationale,
          },
          { runId: context.runId },
        ),
      );

      const observation = await this.invokeToolRequest(stepResult.request, step, role.name, context);
      observations.push(observation);

      await this.stateStore.recordEvent(
        makeEvent(
          'ROLE_OBSERVATION_RECORDED',
          {
            role: role.name,
            taskId: context.taskId ?? null,
            step,
            toolName: observation.toolName,
            ok: observation.ok,
          },
          { runId: context.runId },
        ),
      );

      if (this.config.tools.persistToolEvidence) {
        await this.stateStore.recordEvent(
          makeEvent(
            'TOOL_EVIDENCE_RECORDED',
            {
              role: role.name,
              taskId: context.taskId ?? null,
              step,
              toolName: observation.toolName,
              ok: observation.ok,
              details: summarizeObservation(observation),
            },
            { runId: context.runId },
          ),
        );
      }
    }

    throw new WorkflowPolicyError(`Role ${role.name} exceeded action loop step limit`, {
      details: {
        role: role.name,
        maxSteps: stepLimit,
      },
      retrySuggested: true,
    });
  }

  private async invokeToolRequest(
    request: ToolCallRequest,
    step: number,
    roleName: string,
    context: RoleExecutionContext,
  ): Promise<RoleObservation> {
    const createdAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const output = await this.runWithTimeout(
        async (signal) => this.executeTool(request, signal),
        this.config.llm.timeoutMs,
        `Tool ${request.toolName} timed out at step ${step}`,
        withParentSignal(context.abortSignal),
      );
      await this.recordRunStep({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: roleName,
        tool: request.toolName,
        input: request.input,
        output,
        status: 'succeeded',
        durationMs: Date.now() - startedAt,
      });
      await this.telemetry.incrementCounter({
        name: 'tool_invocation_total',
        runId: context.runId,
        tags: { toolName: request.toolName, role: roleName, status: 'ok' },
      });
      await this.telemetry.recordHistogram({
        name: 'span_tool_invocation_duration_ms',
        value: Date.now() - startedAt,
        runId: context.runId,
        tags: {
          taskId: context.taskId ?? 'unknown',
          role: roleName,
          toolName: request.toolName,
          status: 'ok',
          span: 'tool_invocation',
        },
      });
      await this.telemetry.incrementCounter({
        name: 'llm_token_estimate_total',
        value: estimateObservationTokens(output),
        runId: context.runId,
        tags: { role: roleName, source: 'tool_output_estimate' },
      });
      return {
        step,
        toolName: request.toolName,
        ok: true,
        output,
        createdAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = this.statusForRunStepFailure(error);
      await this.recordRunStep({
        runId: context.runId,
        ...(context.taskId ? { taskId: context.taskId } : {}),
        role: roleName,
        tool: request.toolName,
        input: request.input,
        output: message,
        status,
        durationMs: Date.now() - startedAt,
      });
      await this.telemetry.incrementCounter({
        name: 'tool_invocation_total',
        runId: context.runId,
        tags: { toolName: request.toolName, role: roleName, status: 'error' },
      });
      await this.telemetry.recordHistogram({
        name: 'span_tool_invocation_duration_ms',
        value: Date.now() - startedAt,
        runId: context.runId,
        tags: {
          taskId: context.taskId ?? 'unknown',
          role: roleName,
          toolName: request.toolName,
          status: 'error',
          span: 'tool_invocation',
        },
      });
      await this.telemetry.incrementCounter({
        name: 'run_cost_usd_micro_total',
        value: 0,
        runId: context.runId,
        tags: { role: roleName, source: 'unavailable' },
      });
      return {
        step,
        toolName: request.toolName,
        ok: false,
        error: message,
        createdAt,
      };
    }
  }

  private statusForRunStepFailure(error: unknown): RunStepLogEntry['status'] {
    if (error instanceof StepTimeoutError) {
      return 'timed_out';
    }
    if (error instanceof StepCancelledError) {
      const details = error.details as { propagationState?: string } | undefined;
      return details?.propagationState === 'cancellation_requested'
        ? 'cancellation_requested'
        : 'cancelled';
    }
    return 'failed';
  }

  private async executeTool(request: ToolCallRequest, signal?: AbortSignal): Promise<unknown> {
    const result = await this.tools.execute(
      {
        toolName: request.toolName,
        input: request.input,
      },
      withSignal(signal),
    );

    if (result.ok) {
      return result;
    }

    throw new WorkflowPolicyError(result.error.message, {
      cause: new Error(result.error.code),
      retrySuggested: result.error.retriable,
      details: {
        code: 'TOOL_ERROR_ENVELOPE',
        category: result.error.category,
        toolCode: result.error.code,
        toolName: request.toolName,
        ...(result.error.details ? { errorDetails: result.error.details } : {}),
      },
    });
  }

  private async runWithTimeout<T>(
    execute: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
    options: { parentSignal?: AbortSignal } = {},
  ): Promise<T> {
    const timeoutController = new AbortController();
    const startedAt = Date.now();
    let timeoutId: NodeJS.Timeout | undefined;
    let onParentAbort: (() => void) | undefined;
    try {
      if (options.parentSignal?.aborted) {
        throw new StepCancelledError('Operation cancelled by parent signal', {
          requestedBy: 'parent_signal',
          requestedAt: new Date().toISOString(),
          propagationState: 'cancellation_requested',
          details: { reason: 'parent_cancelled' },
        });
      }

      if (options.parentSignal) {
        onParentAbort = () => {
          timeoutController.abort(options.parentSignal?.reason);
        };
        options.parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }

      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timeoutController.abort(new StepTimeoutError(timeoutMessage, {
            timeoutMs,
            boundary: 'workflow_step',
            elapsedMs: Date.now() - startedAt,
          }));
          reject(
            new StepTimeoutError(timeoutMessage, {
              timeoutMs,
              boundary: 'workflow_step',
              elapsedMs: Date.now() - startedAt,
            }),
          );
        }, timeoutMs);
      });

      return await Promise.race([execute(timeoutController.signal), timeout]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new StepCancelledError('Operation aborted', {
          requestedBy: 'system',
          requestedAt: new Date().toISOString(),
          propagationState: 'cancelled',
          cause: error,
        });
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (options.parentSignal && onParentAbort) {
        options.parentSignal.removeEventListener('abort', onParentAbort);
      }
    }
  }

  private validateRoleResult(
    role: RoleExecutionContext['role'],
    response: RoleResponse<unknown>,
  ): void {
    const responseIssues = validateRoleResponse(role, response);
    const outputIssues = defaultRoleOutputSchemaRegistry.validate(role, response.output);
    const issues = [...responseIssues, ...outputIssues];
    if (issues.length > 0) {
      throw new SchemaValidationError('Role response registry validation failed', {
        details: {
          role,
          issues,
        },
        retrySuggested: false,
      });
    }
  }

  private makeRunSingleTaskError(
    taskId: string,
    reason: RunSingleTaskErrorReason,
    message: string,
  ): WorkflowPolicyError {
    return new WorkflowPolicyError(message, {
      details: {
        operation: 'runSingleTask',
        taskId,
        reason,
      },
      retrySuggested: false,
      needsHumanDecision: reason === 'task_blocked' || reason === 'task_not_executable',
    });
  }

  private async recordGitBranchArtifact(
    state: ProjectState,
    input: { runId: string; taskId: string; branchName?: string },
  ): Promise<void> {
    const branchArtifact = makeArtifact('git_lifecycle', `Git branch for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'branch',
      branchName: input.branchName ?? 'unknown',
    });
    await this.stateStore.recordArtifact(branchArtifact);
    state.artifacts.push(branchArtifact);
  }


  private async persistAndRequirePolicyDecision(input: {
    state: ProjectState;
    runId: string;
    taskId: string;
    stepId: string;
    attempt: number;
    actionType: ExecutionPolicyActionType;
    riskLevel?: 'low' | 'medium' | 'high';
    inputHashSeed: string;
    reasonCodes: string[];
  }): Promise<void> {
    const decision = {
      decisionId: crypto.randomUUID(),
      tenantId: input.state.orgId,
      projectId: input.state.projectId,
      runId: input.runId,
      stepId: input.stepId,
      attempt: input.attempt,
      actionType: input.actionType,
      riskLevel: input.riskLevel ?? classifyExecutionPolicyActionRisk(input.actionType).riskLevel,
      decision: 'allow' as const,
      reasonCodes: input.reasonCodes,
      decidedAt: new Date().toISOString(),
      decider: 'orchestrator_policy_gate_v1',
      inputHash: this.createPolicyInputHash(input.inputHashSeed),
      traceId: input.runId,
      policyVersion: 'policyDecisionPersistenceV1',
    };
    await this.stateStore.recordPolicyDecision(decision);
    input.state.policyDecisions.push(decision);

    const persisted = await this.stateStore.getPolicyDecision({
      runId: input.runId,
      stepId: input.stepId,
      attempt: input.attempt,
      actionType: input.actionType,
    });
    if (!persisted) {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DECISION_MISSING', input.actionType), {
        details: { policyCode: 'POLICY_DECISION_MISSING', runId: input.runId, taskId: input.taskId, stepId: input.stepId },
      });
    }
    if (persisted.policyVersion !== 'policyDecisionPersistenceV1' || persisted.inputHash !== decision.inputHash) {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DECISION_STALE', input.actionType), {
        details: { policyCode: 'POLICY_DECISION_STALE', runId: input.runId, taskId: input.taskId, stepId: input.stepId },
      });
    }
    if (persisted.decision !== 'allow') {
      throw new WorkflowPolicyError(formatPolicyDecisionError('POLICY_DENIED', input.actionType), {
        details: { policyCode: 'POLICY_DENIED', runId: input.runId, taskId: input.taskId, stepId: input.stepId },
      });
    }
  }

  private createPolicyInputHash(seed: string): string {
    return Buffer.from(seed).toString('base64url').slice(0, 64);
  }

  private async recordGitLifecycleCompletionArtifacts(
    state: ProjectState,
    input: { runId: string; taskId: string; taskTitle: string; branchName?: string; workspaceRoot: string },
  ): Promise<'ok' | 'approval_pending'> {
    const isApprovalGateEnabled = (this.config.workflow.approvalGateMode ?? 'disabled') === 'enabled';
    const requiredApprovalActions = new Set(this.config.workflow.approvalRequiredActions ?? ['git_push', 'pr_draft']);
    const branchName = input.branchName ?? (await this.currentGitBranch(input.workspaceRoot)) ?? 'unknown';
    const hasChanges = await this.workspaceHasGitChanges(input.workspaceRoot);
    const commitMessage = `feat(${input.taskId}): ${input.taskTitle} [run:${input.runId}]`;
    let commitStatus = hasChanges ? 'pending' : 'skipped_no_changes';
    let pushStatus = hasChanges ? 'pending' : 'skipped_no_changes';
    let commitSha = 'none';
    let prStatus = 'skipped_push_not_successful';
    let isWaitingForApproval = false;

    if (hasChanges) {
      const dedupTtlMs = 30 * 60 * 1000;
      const nowIso = new Date().toISOString();
      const commitDedupKey = buildIdempotencyKey({
        tenantId: state.orgId,
        projectId: state.projectId,
        runId: input.runId,
        taskId: input.taskId,
        stage: 'git_commit',
        attempt: 0,
        sideEffectType: 'git_commit',
        normalizedInput: `${commitMessage}|${branchName}`,
      });
      const commitReserve = reserveSideEffect(state.execution.dedupRegistry, {
        key: commitDedupKey,
        leaseOwner: input.runId,
        nowIso,
        ttlMs: dedupTtlMs,
      });
      if (commitReserve.dedupSuppressed) {
        commitStatus = 'skipped_duplicate';
        pushStatus = 'skipped_duplicate';
      } else {
      await this.persistAndRequirePolicyDecision(buildStepPolicyGateRequest({
        state, runId: input.runId, taskId: input.taskId, stepId: `${input.taskId}:git_commit`, attempt: 0,
        actionType: 'git_commit', inputHashSeed: `${input.runId}:${input.taskId}:git_commit:${commitMessage}`,
        reasonCodes: ['REPO_CHANGES_PRESENT'],
      }));
      const committed = await this.createCommit(input.workspaceRoot, commitMessage);
      commitStatus = committed.ok ? 'created' : 'failed';
      const commitPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
      completeSideEffect(state.execution.dedupRegistry, {
        key: commitDedupKey,
        nowIso: new Date().toISOString(),
        status: committed.ok ? 'succeeded' : 'failed',
        ...(commitPolicyDecisionId ? { policyDecisionId: commitPolicyDecisionId } : {}),
      });
      if (committed.ok) {
        commitSha = committed.commitSha;
        if (isApprovalGateEnabled) {
          const sourceRiskActions = await this.detectRiskyActionsFromCommit(input.workspaceRoot, commitSha);
          for (const riskAction of sourceRiskActions) {
            if (!requiredApprovalActions.has(riskAction)) {
              continue;
            }
            const sourceGate = await this.evaluateApprovalGate(state, {
              runId: input.runId,
              taskId: input.taskId,
              requestedAction: riskAction,
              reason: this.describeRiskAction(riskAction),
              metadata: {
                branchName,
                commitSha,
              },
            });
            if (sourceGate.status !== 'resumed') {
              isWaitingForApproval = true;
            }
          }
        }
        const pushGate = isApprovalGateEnabled
          && requiredApprovalActions.has('git_push')
          ? await this.evaluateApprovalGate(state, {
            runId: input.runId,
            taskId: input.taskId,
            requestedAction: 'git_push',
            reason: `Push branch ${branchName} to origin`,
            metadata: {
              branchName,
              commitSha,
            },
          })
          : { status: 'resumed' as const };
        if (pushGate.status === 'rejected') {
          pushStatus = 'skipped_rejected';
        } else if (pushGate.status === 'pending' || pushGate.status === 'approved') {
          pushStatus = pushGate.status === 'pending' ? 'pending_approval' : 'waiting_resume';
          isWaitingForApproval = true;
        } else {
          const pushDedupKey = buildIdempotencyKey({
            tenantId: state.orgId,
            projectId: state.projectId,
            runId: input.runId,
            taskId: input.taskId,
            stage: 'git_push',
            attempt: 0,
            sideEffectType: 'git_push',
            normalizedInput: `${branchName}|${commitSha}`,
          });
          const pushReserve = reserveSideEffect(state.execution.dedupRegistry, {
            key: pushDedupKey,
            leaseOwner: input.runId,
            nowIso: new Date().toISOString(),
            ttlMs: dedupTtlMs,
          });
          if (pushReserve.dedupSuppressed) {
            pushStatus = 'skipped_duplicate';
          } else {
          await this.persistAndRequirePolicyDecision(buildStepPolicyGateRequest({
            state, runId: input.runId, taskId: input.taskId, stepId: `${input.taskId}:git_push`, attempt: 0,
            actionType: 'git_push', inputHashSeed: `${input.runId}:${input.taskId}:git_push:${branchName}:${commitSha}`,
            reasonCodes: ['APPROVAL_GATE_PASSED'],
          }));
          const isPushed = await this.pushBranch(input.workspaceRoot, branchName);
          pushStatus = isPushed ? 'pushed' : 'failed';
          const pushPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
          completeSideEffect(state.execution.dedupRegistry, {
            key: pushDedupKey,
            nowIso: new Date().toISOString(),
            status: isPushed ? 'succeeded' : 'failed',
            ...(pushPolicyDecisionId ? { policyDecisionId: pushPolicyDecisionId } : {}),
          });
          }
        }
      } else {
        pushStatus = 'skipped_commit_failed';
      }
      }
    }

    const commitArtifact = makeArtifact('git_lifecycle', `Git commit metadata for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'commit',
      branchName,
      commitStatus,
      pushStatus,
      commitSha: truncateText(commitSha, 120),
      commitMessage: truncateText(commitMessage, 250),
    });
    await this.stateStore.recordArtifact(commitArtifact);
    state.artifacts.push(commitArtifact);

    const prTitle = `[${input.taskId}] ${input.taskTitle}`;
    const prBody = [
      `Task: ${input.taskId}`,
      `Run: ${input.runId}`,
      `Branch: ${branchName}`,
      `Commit: ${commitSha}`,
      '',
      'Automated draft PR from ai-orchestrator.',
    ].join('\n');
    if (pushStatus === 'pushed') {
      const prGate = isApprovalGateEnabled
        && requiredApprovalActions.has('pr_draft')
        ? await this.evaluateApprovalGate(state, {
          runId: input.runId,
          taskId: input.taskId,
          requestedAction: 'pr_draft',
          reason: `Create draft PR for branch ${branchName}`,
          metadata: {
            branchName,
            prTitle,
          },
        })
        : { status: 'resumed' as const };
      if (prGate.status === 'rejected') {
        prStatus = 'skipped_rejected';
      } else if (prGate.status === 'pending' || prGate.status === 'approved') {
        prStatus = prGate.status === 'pending' ? 'pending_approval' : 'waiting_resume';
        isWaitingForApproval = true;
      } else {
        const prDedupKey = buildIdempotencyKey({
          tenantId: state.orgId,
          projectId: state.projectId,
          runId: input.runId,
          taskId: input.taskId,
          stage: 'pr_draft',
          attempt: 0,
          sideEffectType: 'pr_draft',
          normalizedInput: `${branchName}|${prTitle}`,
        });
        const prReserve = reserveSideEffect(state.execution.dedupRegistry, {
          key: prDedupKey,
          leaseOwner: input.runId,
          nowIso: new Date().toISOString(),
          ttlMs: 30 * 60 * 1000,
        });
        if (prReserve.dedupSuppressed) {
          prStatus = 'skipped_duplicate';
        } else {
        await this.persistAndRequirePolicyDecision(buildStepPolicyGateRequest({
          state, runId: input.runId, taskId: input.taskId, stepId: `${input.taskId}:pr_draft`, attempt: 0,
          actionType: 'pr_draft', inputHashSeed: `${input.runId}:${input.taskId}:pr_draft:${branchName}:${prTitle}`,
          reasonCodes: ['PUSH_SUCCESSFUL'],
        }));
        const isPrCreated = await this.createPullRequestDraft(input.workspaceRoot, branchName, prTitle, prBody);
        prStatus = isPrCreated ? 'created' : 'failed';
        const prPolicyDecisionId = state.policyDecisions.at(-1)?.decisionId;
        completeSideEffect(state.execution.dedupRegistry, {
          key: prDedupKey,
          nowIso: new Date().toISOString(),
          status: isPrCreated ? 'succeeded' : 'failed',
          ...(prPolicyDecisionId ? { policyDecisionId: prPolicyDecisionId } : {}),
        });
        }
      }
    }
    const prArtifact = makeArtifact('git_lifecycle', `PR draft metadata for ${input.taskId}`, {
      runId: input.runId,
      taskId: input.taskId,
      stage: 'pr_draft',
      branchName,
      prStatus,
      prTitle: truncateText(prTitle, 250),
      prBody: truncateText(prBody, 250),
    });
    await this.stateStore.recordArtifact(prArtifact);
    state.artifacts.push(prArtifact);
    if (isWaitingForApproval) {
      const resumeModeArtifact = makeArtifact('report', `Approval pending for ${input.taskId}`, {
        runId: input.runId,
        taskId: input.taskId,
        resumeMode: 'manual_run_cycle',
        note: 'Approve and resume by invoking the run cycle again from control plane',
      });
      await this.stateStore.recordArtifact(resumeModeArtifact);
      state.artifacts.push(resumeModeArtifact);
    }
    return isWaitingForApproval ? 'approval_pending' : 'ok';
  }

  private describeRiskAction(action: ApprovalRequest['requestedAction']): string {
    const messages: Record<ApprovalRequest['requestedAction'], string> = {
      git_push: 'Push branch to origin',
      pr_draft: 'Create draft pull request',
      db_migration: 'Database migration files changed',
      file_delete: 'One or more files were deleted',
      api_breaking_change: 'Potential public API surface change detected',
      dependency_bump: 'Dependency manifest or lock file changed',
      security_auth_change: 'Security/auth-related files changed',
      production_config_change: 'Production configuration files changed',
      bulk_file_change: 'Large batch of files changed',
    };
    return messages[action];
  }

  private async detectRiskyActionsFromCommit(
    workspaceRoot: string,
    commitSha: string,
  ): Promise<ApprovalRequest['requestedAction'][]> {
    const actions = new Set<ApprovalRequest['requestedAction']>();
    const lines = await this.readCommitNameStatus(workspaceRoot, commitSha);
    const changedPaths: string[] = [];
    for (const line of lines) {
      const [status, ...rest] = line.split('\t');
      const filePath = rest.at(-1);
      if (!status || !filePath) {
        continue;
      }
      changedPaths.push(filePath);
      const normalized = filePath.toLowerCase();
      if (status.startsWith('D')) {
        actions.add('file_delete');
      }
      if (
        normalized.endsWith('package.json')
        || normalized.endsWith('package-lock.json')
        || normalized.endsWith('pnpm-lock.yaml')
      ) {
        actions.add('dependency_bump');
      }
      if (normalized.includes('migration') || normalized.endsWith('.sql')) {
        actions.add('db_migration');
      }
      if (normalized.includes('/auth/') || normalized.includes('/security/')) {
        actions.add('security_auth_change');
      }
      if (
        normalized.endsWith('.env')
        || normalized.includes('/k8s/')
        || normalized.includes('/helm/')
        || normalized.includes('/deploy/')
        || normalized.includes('/terraform/')
      ) {
        actions.add('production_config_change');
      }
      if (
        normalized.includes('/api/')
        || normalized.includes('/public/')
        || normalized.endsWith('/index.ts')
        || normalized.includes('/contracts/')
      ) {
        actions.add('api_breaking_change');
      }
    }

    if (changedPaths.length >= (this.config.workflow.approvalBulkFileThreshold ?? 25)) {
      actions.add('bulk_file_change');
    }
    return [...actions];
  }

  private async readCommitNameStatus(workspaceRoot: string, commitSha: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['show', '--name-status', '--format=', '--no-renames', commitSha],
        { cwd: workspaceRoot },
      );
      return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private async evaluateApprovalGate(
    state: ProjectState,
    input: {
      runId: string;
      taskId: string;
      requestedAction: ApprovalRequest['requestedAction'];
      reason: string;
      metadata: Record<string, string>;
    },
  ): Promise<{ status: 'pending' | 'approved' | 'rejected' | 'resumed' }> {
    const existing = state.approvals.find((request) =>
      request.runId === input.runId
      && request.taskId === input.taskId
      && request.requestedAction === input.requestedAction
      && request.status !== 'completed'
    );
    if (existing) {
      if (existing.status === 'completed') {
        return { status: 'resumed' };
      }
      return { status: existing.status };
    }

    const approvalRequest: ApprovalRequest = {
      id: crypto.randomUUID(),
      runId: input.runId,
      taskId: input.taskId,
      reason: input.reason,
      requestedAction: input.requestedAction,
      riskLevel: classifyApprovalRequestedActionRisk(input.requestedAction).riskLevel as 'medium' | 'high',
      status: 'pending',
      metadata: input.metadata,
      createdAt: new Date().toISOString(),
    };
    state.approvals = [...state.approvals, approvalRequest];
    await this.stateStore.recordEvent(
      makeEvent(
        'APPROVAL_REQUESTED',
        {
          approvalRequestId: approvalRequest.id,
          runId: approvalRequest.runId,
          taskId: approvalRequest.taskId,
          requestedAction: approvalRequest.requestedAction,
          reason: approvalRequest.reason,
          status: approvalRequest.status,
        },
        { runId: approvalRequest.runId },
      ),
    );
    return { status: 'pending' };
  }

  private async workspaceHasGitChanges(workspaceRoot: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['status', '--short', '--untracked-files=all'], {
        cwd: workspaceRoot,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async currentGitBranch(workspaceRoot: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: workspaceRoot });
      const branch = stdout.trim();
      return branch.length > 0 ? branch : null;
    } catch {
      return null;
    }
  }

  private async createCommit(
    workspaceRoot: string,
    commitMessage: string,
  ): Promise<{ ok: true; commitSha: string } | { ok: false }> {
    try {
      await execFileAsync('git', ['add', '-A'], { cwd: workspaceRoot });
      await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: workspaceRoot });
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot });
      return { ok: true, commitSha: stdout.trim() };
    } catch {
      return { ok: false };
    }
  }

  private async pushBranch(workspaceRoot: string, branchName: string): Promise<boolean> {
    try {
      await execFileAsync('git', ['push', '--set-upstream', 'origin', branchName], { cwd: workspaceRoot });
      return true;
    } catch {
      return false;
    }
  }

  private async createPullRequestDraft(
    workspaceRoot: string,
    branchName: string,
    title: string,
    body: string,
  ): Promise<boolean> {
    try {
      await execFileAsync(
        'gh',
        ['pr', 'create', '--draft', '--head', branchName, '--title', title, '--body', body],
        { cwd: workspaceRoot },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async recordRunStep(input: {
    runId: string;
    taskId?: string;
    role: string;
    tool?: string;
    input: unknown;
    output: unknown;
    status: RunStepLogEntry['status'];
    durationMs: number;
  }): Promise<void> {
    const stepId = crypto.randomUUID();
    const attempt = 0;
    const prevChecksum = this.currentRunChecksumByRunId.get(input.runId);
    const step: RunStepLogEntry = {
      id: stepId,
      tenantId: this.currentEvidenceTenantId ?? 'default-org',
      projectId: this.currentEvidenceProjectId ?? 'ai-orchestrator',
      runId: input.runId,
      stepId,
      attempt,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      role: input.role,
      ...(input.tool ? { tool: input.tool } : {}),
      input: truncateText(safeStringify(input.input)),
      output: truncateText(safeStringify(input.output)),
      status: input.status,
      idempotencyKey: `${input.runId}:${stepId}:${attempt}`,
      checksum: '',
      ...(prevChecksum ? { prevChecksum } : {}),
      traceId: input.runId,
      durationMs: Math.max(0, input.durationMs),
      createdAt: new Date().toISOString(),
    };
    step.checksum = computeRunStepChecksum({
      evidenceId: step.id,
      tenantId: step.tenantId,
      projectId: step.projectId,
      runId: step.runId,
      stepId: step.stepId,
      attempt: step.attempt,
      status: step.status,
      idempotencyKey: step.idempotencyKey,
      createdAt: step.createdAt,
      ...(step.prevChecksum ? { prevChecksum: step.prevChecksum } : {}),
      traceId: step.traceId,
    });
    this.currentRunChecksumByRunId.set(input.runId, step.checksum);
    await this.stateStore.recordRunStep(step);
    this.currentRunStepBuffer?.push(step);
  }

  private flushRunStepBufferToState(state: ProjectState): void {
    if (!this.currentRunStepBuffer || this.currentRunStepBuffer.length === 0) {
      return;
    }
    state.execution.runStepLog ??= [];
    state.execution.runStepLog.push(...this.currentRunStepBuffer);
    this.currentRunStepBuffer = [];
  }
}

function estimateObservationTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

function rewriteSupersededDependencies(
  state: ProjectState,
  supersededTaskId: string,
  completionTaskId: string,
  childTasks: readonly BacklogTask[],
): void {
  const childTaskIds = new Set(childTasks.map((task) => task.id));
  for (const candidate of Object.values(state.backlog.tasks)) {
    if (candidate.id === supersededTaskId || childTaskIds.has(candidate.id)) {
      continue;
    }

    if (!candidate.dependsOn.includes(supersededTaskId)) {
      continue;
    }

    const nextDependsOn = candidate.dependsOn.map((dependency) =>
      dependency === supersededTaskId ? completionTaskId : dependency,
    );
    candidate.dependsOn = [...new Set(nextDependsOn)];
  }
}

function summarizeState(state: ProjectState): string {
  return [
    `project=${state.projectName}`,
    `milestones=${Object.keys(state.milestones).length}`,
    `tasks=${Object.keys(state.backlog.tasks).length}`,
    `completed=${state.execution.completedTaskIds.length}`,
  ].join(' ');
}

function makeArtifact(
  type: ArtifactRecord['type'],
  title: string,
  metadata: Record<string, string>,
): ArtifactRecord {
  return {
    id: crypto.randomUUID(),
    type,
    title,
    metadata,
    createdAt: new Date().toISOString(),
  };
}

function summarizeObservation(observation: RoleObservation): string {
  if (!observation.ok) {
    return truncateText(observation.error ?? 'unknown tool error');
  }

  if (typeof observation.output === 'string') {
    return truncateText(observation.output);
  }

  if (typeof observation.output === 'undefined') {
    return 'no output';
  }

  try {
    return truncateText(JSON.stringify(observation.output));
  } catch {
    return 'unserializable output';
  }
}

function truncateText(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...(truncated)`;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

function withParentSignal(parentSignal?: AbortSignal): { parentSignal?: AbortSignal } {
  return parentSignal ? { parentSignal } : {};
}
