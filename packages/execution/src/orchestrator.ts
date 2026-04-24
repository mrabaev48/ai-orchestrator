import type { ArtifactRecord, BacklogTask, ProjectState } from '../../core/src/index.ts';
import { assertProjectState, isExecutableTask, makeEvent } from '../../core/src/index.ts';
import { defaultRoleOutputSchemaRegistry, validateRoleResponse } from '../../core/src/index.ts';
import type { Logger, RuntimeConfig } from '../../shared/src/index.ts';
import { SchemaValidationError, WorkflowPolicyError } from '../../shared/src/index.ts';
import path from 'node:path';
import type { StateStore } from '../../state/src/index.ts';
import type { ToolSet } from '../../tools/src/index.ts';
import { createLocalToolSet } from '../../tools/src/index.ts';
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
  RoleExecutionContext,
  RoleRequest,
  RoleResponse,
} from '../../core/src/roles.ts';

export interface RunCycleResult {
  runId: string;
  status: 'completed' | 'blocked' | 'idle';
  taskId?: string;
  stopReason?: string;
}

export interface RunCycleOptions {
  forcedTaskId?: string;
}

export type RunSingleTaskErrorReason =
  | 'invalid_task_id'
  | 'task_blocked'
  | 'task_done'
  | 'task_not_executable';

export class Orchestrator {
  private readonly tools: ToolSet;
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly config: RuntimeConfig;
  private readonly logger: Logger;

  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    config: RuntimeConfig,
    logger: Logger,
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.config = config;
    this.logger = logger;
    this.tools = createLocalToolSet(config.tools.allowedWritePaths);
  }

  async runCycle(options: RunCycleOptions = {}): Promise<RunCycleResult> {
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
    }, this.makeContext('prompt_engineer', runId, state, task.id));

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
    }, this.makeContext(roleName, runId, state, task.id));

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
      }, this.makeContext('reviewer', runId, state, task.id));

      if (!review.output.approved || review.output.blockingIssues.length > 0) {
        await this.stateStore.recordEvent(makeEvent('REVIEW_REJECTED', { taskId: task.id }, { runId }));
        return this.handleFailure(state, task, 'reviewer', 'review_rejected', runId);
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
      }, this.makeContext('tester', runId, state, task.id));

      if (!testing.output.passed || testing.output.failures.length > 0) {
        await this.stateStore.recordEvent(makeEvent('TEST_FAILED', { taskId: task.id }, { runId }));
        return this.handleFailure(state, task, 'tester', 'test_failed', runId);
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

  private async selectNextTask(state: ProjectState, runId: string): Promise<BacklogTask | null> {
    const taskManager = this.roleRegistry.get<{ state: ProjectState }, BacklogTask | null>('task_manager');
    const taskSelection = await this.executeRole(taskManager, {
      role: 'task_manager',
      objective: 'Select next executable task',
      input: { state },
      acceptanceCriteria: ['Return a single executable task or null'],
    }, this.makeContext('task_manager', runId, state));

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
    taskId?: string,
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
        workspaceRoot: path.resolve(this.config.tools.allowedWritePaths[0] ?? process.cwd()),
        evidenceSource: taskId ? 'runtime_events' : 'state_snapshot',
      },
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
    const firstAttempt = await role.execute(request, context);
    try {
      await role.validate?.(firstAttempt);
      this.validateRoleResult(request.role, firstAttempt);
      return firstAttempt;
    } catch {
      context.logger.warn('Role validation failed, retrying once', {
        event: 'schema_validation_retry',
      });
      const secondAttempt = await role.execute(request, context);
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
