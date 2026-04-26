import type { ArtifactRecord, BacklogTask, ProjectState } from '../../core/src/index.ts';
import { assertProjectState, isExecutableTask, makeEvent } from '../../core/src/index.ts';
import { defaultRoleOutputSchemaRegistry, validateRoleResponse } from '../../core/src/index.ts';
import type { Logger, RuntimeConfig } from '../../shared/src/index.ts';
import { SchemaValidationError, WorkflowPolicyError } from '../../shared/src/index.ts';
import path from 'node:path';
import type { StateStore } from '../../state/src/index.ts';
import type { ToolSet } from '../../tools/src/index.ts';
import { createLocalToolSet } from '../../tools/src/index.ts';
import { createLockAuthority, type LockAuthority } from './lock-authority.ts';
import { StateStoreExecutionTelemetry, type ExecutionTelemetry } from './telemetry.ts';
import {
  createWorkspaceManager,
  StaticWorkspaceManager,
  type ManagedWorkspace,
  type WorkspaceManager,
} from './workspace-manager.ts';
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
      ?? (config.tools.writeMode === 'workspace-write' || config.tools.writeMode === 'protected-write'
        ? createWorkspaceManager(config.tools.allowedWritePaths[0] ?? process.cwd())
        : new StaticWorkspaceManager(config.tools.allowedWritePaths[0] ?? process.cwd()));
  }

  async runCycle(options: RunCycleOptions = {}): Promise<RunCycleResult> {
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
    this.tools = workspaceTools;
    try {
      state.execution.activeRunId = runId;
      state.execution.activeTaskId = task.id;
      await this.stateStore.recordEvent(makeEvent('TASK_SELECTED', { taskId: task.id }, { runId }));

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

      const executionResponse = await this.executeRole(executor, {
      role: roleName,
      objective: `Execute ${task.id}`,
      input: { task, prompt: promptResponse.output },
      acceptanceCriteria: task.acceptanceCriteria,
      }, this.makeContext(roleName, runId, state, workspace.rootPath, task.id, abortSignal));

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
        { passed: boolean; testPlan: string[]; evidence: string[]; failures: string[]; missingCoverage: string[] }
      >('tester');

        const testing = await this.executeRole(tester, {
        role: 'tester',
        objective: `Test ${task.id}`,
        input: { task, result: executionResponse.output },
        acceptanceCriteria: ['Return explicit evidence'],
        }, this.makeContext('tester', runId, state, workspace.rootPath, task.id, abortSignal));

      if (!testing.output.passed || testing.output.failures.length > 0) {
        await this.stateStore.recordEvent(makeEvent('TEST_FAILED', { taskId: task.id }, { runId }));
        return await this.handleFailure(state, task, 'tester', 'test_failed', runId);
      }

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

    const stateCommittedEvent = makeEvent('STATE_COMMITTED', { taskId: task.id }, { runId });
    await this.stateStore.saveWithEvents(state, [stateCommittedEvent]);

    this.logger.info('Run cycle completed', {
      event: 'cycle_end',
      runId,
      taskId: task.id,
      result: 'ok',
    });

      return {
        runId,
        taskId: task.id,
        status: 'completed',
      };
    } catch (error) {
      await workspace.rollback().catch(() => {});
      throw error;
    } finally {
      await workspace.cleanup().catch(() => {});
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

    const failure = await this.stateStore.recordFailure({
      taskId: task.id,
      role,
      reason,
      retrySuggested: action !== 'block',
    });
    state.failures.push(failure);
    state.execution.retryCounts[task.id] = (state.execution.retryCounts[task.id] ?? 0) + 1;
    delete state.execution.activeTaskId;

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
    return {
      role,
      runId,
      ...(taskId ? { taskId } : {}),
      stateSummary: summarizeState(state),
      toolProfile: {
        allowedWritePaths: this.config.tools.allowedWritePaths,
        canWriteRepo: role === 'coder' || role === 'docs_writer',
        canApproveChanges: false,
        canRunTests: role === 'tester',
      },
      toolExecution: {
        policy: role === 'tester' ? 'quality_gate' : role === 'coder' || role === 'docs_writer'
          ? 'orchestrator_default'
          : 'read_only_analysis',
        permissionScope: role === 'tester' ? 'test_execution' : role === 'coder' || role === 'docs_writer'
          ? 'repo_write'
          : 'read_only',
        workspaceRoot,
        evidenceSource: taskId ? 'runtime_events' : 'state_snapshot',
      },
      ...(abortSignal ? { abortSignal } : {}),
      logger: this.logger.withContext({
        runId,
        role,
        ...(taskId ? { taskId } : {}),
      }),
    };
  }

  private async executeRole<TInput, TOutput>(
    role: AgentRole<TInput, TOutput>,
    request: RoleRequest<TInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<TOutput>> {
    const firstAttempt = await this.executeRoleWithLoop(role, request, context);
    try {
      await role.validate?.(firstAttempt);
      this.validateRoleResult(request.role, firstAttempt);
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
        throw new SchemaValidationError('Role response schema validation failed', {
          cause: validationError,
          retrySuggested: false,
        });
      }
      return secondAttempt;
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

    for (let step = 1; step <= stepLimit; step += 1) {
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

      const stepResult: RoleStepResult<TOutput> = await this.runWithTimeout(
        async (signal) => executeStep(request, { ...context, abortSignal: signal }, observations),
        this.config.llm.timeoutMs,
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

      const observation = await this.invokeToolRequest(stepResult.request, step, context.abortSignal);
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
    parentSignal?: AbortSignal,
  ): Promise<RoleObservation> {
    const createdAt = new Date().toISOString();
    try {
      const output = await this.runWithTimeout(
        async (signal) => this.executeTool(request, signal),
        this.config.llm.timeoutMs,
        `Tool ${request.toolName} timed out at step ${step}`,
        withParentSignal(parentSignal),
      );
      return {
        step,
        toolName: request.toolName,
        ok: true,
        output,
        createdAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        step,
        toolName: request.toolName,
        ok: false,
        error: message,
        createdAt,
      };
    }
  }

  private async executeTool(request: ToolCallRequest, signal?: AbortSignal): Promise<unknown> {
    try {
      return await this.tools.execute(
        {
          toolName: request.toolName,
          input: request.input,
        },
        withSignal(signal),
      );
    } catch (error) {
      throw new WorkflowPolicyError(
        `Unsupported tool request: ${request.toolName}`,
        {
          cause: error,
          retrySuggested: false,
        },
      );
    }
  }

  private async runWithTimeout<T>(
    execute: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
    options: { parentSignal?: AbortSignal } = {},
  ): Promise<T> {
    const timeoutController = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;
    let onParentAbort: (() => void) | undefined;
    try {
      if (options.parentSignal?.aborted) {
        throw new WorkflowPolicyError('Operation cancelled by parent signal', {
          details: { reason: 'parent_cancelled' },
          retrySuggested: true,
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
          timeoutController.abort(new WorkflowPolicyError(timeoutMessage, {
            details: { timeoutMs },
            retrySuggested: true,
          }));
          reject(
            new WorkflowPolicyError(timeoutMessage, {
              details: { timeoutMs },
              retrySuggested: true,
            }),
          );
        }, timeoutMs);
      });

      return await Promise.race([execute(timeoutController.signal), timeout]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new WorkflowPolicyError('Operation aborted', {
          cause: error,
          retrySuggested: true,
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

function withSignal(signal?: AbortSignal): { signal?: AbortSignal } {
  return signal ? { signal } : {};
}

function withParentSignal(parentSignal?: AbortSignal): { parentSignal?: AbortSignal } {
  return parentSignal ? { parentSignal } : {};
}
