import path from 'node:path';

import {
  assertProjectState,
  defaultExecutionPolicyEngine,
  isExecutableTask,
  type BacklogTask,
  type ProjectState,
  type RoleExecutionContext,
} from '@ai-orchestrator/core';
import type { RoleRegistry } from '@ai-orchestrator/agents';
import { shouldStopRun } from '@ai-orchestrator/workflow';
import type { StateStore } from '@ai-orchestrator/state';
import { createLocalToolSet } from '@ai-orchestrator/tools';
import { type Logger, type RuntimeConfig, WorkflowPolicyError } from '@ai-orchestrator/shared';

import { createLockAuthority, type LockAuthority } from './lock-authority.js';
import { createFencingTokenGuard, type FencingTokenGuard } from './locks/fencing-token-guard.js';
import { createDistributedLockStore } from './locks/distributed-lock-store-factory.js';
import { StateStoreExecutionTelemetry, type ExecutionTelemetry } from './telemetry.js';
import {
  createWorkspaceManager,
  type WorkspaceManager,
} from './workspace-manager.js';
import {
  type RunCycleOptions,
  type RunCycleResult,
  type RunSingleTaskErrorReason,
} from './run-cycle-types.js';
import { summarizeState } from './runtime-utils.js';
import { RunStepRecorder } from './persistence/run-step-recorder.js';
import { PolicyDecisionRecorder } from './persistence/policy-decision-recorder.js';
import { RoleRunner, RoleRunCostTracker } from './roles/role-runner.js';
import { FailureHandler } from './failure/failure-handler.js';
import { GitLifecycleCoordinator } from './git/git-lifecycle-coordinator.js';
import { WorkspaceRunCoordinator } from './workspace/workspace-run-coordinator.js';
import { TaskRunner } from './task/task-runner.js';

export type {
  RunCycleOptions,
  RunCycleResult,
  RunSingleTaskErrorReason,
} from './run-cycle-types.js';

export interface OrchestratorOverrides {
  lockAuthority?: LockAuthority;
  telemetry?: ExecutionTelemetry;
  workspaceManager?: WorkspaceManager;
  fencingTokenGuard?: FencingTokenGuard;
}

export class Orchestrator {
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly config: RuntimeConfig;
  private readonly logger: Logger;
  private readonly lockAuthority: LockAuthority;
  private readonly fencingTokenGuard: FencingTokenGuard;
  private readonly telemetry: ExecutionTelemetry;
  private readonly taskRunner: TaskRunner;
  private readonly workspaceRunCoordinator: WorkspaceRunCoordinator;
  private readonly roleRunner: RoleRunner;

  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    config: RuntimeConfig,
    logger: Logger,
    overrides?: OrchestratorOverrides,
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.config = config;
    this.logger = logger;
    this.lockAuthority = overrides?.lockAuthority ?? createLockAuthority(config);
    this.fencingTokenGuard = overrides?.fencingTokenGuard ?? createFencingTokenGuard(
      createDistributedLockStore(config),
      logger,
      { ttlMs: config.workflow.fencingTtlMs ?? 60_000 },
    );
    this.telemetry = overrides?.telemetry ?? new StateStoreExecutionTelemetry(stateStore, logger);
    const workspaceManager = overrides?.workspaceManager
      ?? createWorkspaceManager({
        mode: config.workflow.workspaceManagerMode ?? 'git-worktree',
        repoRoot: config.tools.allowedWritePaths[0] ?? process.cwd(),
        branchTtlHours: config.workflow.workspaceBranchTtlHours ?? 24,
      });

    const runStepRecorder = new RunStepRecorder(stateStore);
    const policyDecisionRecorder = new PolicyDecisionRecorder(stateStore);
    const defaultTools = createLocalToolSet({
      allowedWritePaths: config.tools.allowedWritePaths,
      allowedShellCommands: config.tools.allowedShellCommands,
      ...(config.tools.writeMode ? { writeMode: config.tools.writeMode } : {}),
      ...(config.tools.protectedWritePaths ? { protectedWritePaths: config.tools.protectedWritePaths } : {}),
      ...(typeof config.tools.maxModifiedFiles === 'number'
        ? { maxModifiedFiles: config.tools.maxModifiedFiles }
        : {}),
    });
    this.roleRunner = new RoleRunner({
      stateStore,
      config,
      telemetry: this.telemetry,
      runStepRecorder,
      costTracker: new RoleRunCostTracker(),
      tools: defaultTools,
    });
    const failureHandler = new FailureHandler({
      stateStore,
      config,
      runStepRecorder,
    });
    const gitLifecycleCoordinator = new GitLifecycleCoordinator({
      stateStore,
      config,
      policyDecisionRecorder,
    });
    this.workspaceRunCoordinator = new WorkspaceRunCoordinator({
      stateStore,
      config,
      workspaceManager,
      gitLifecycleCoordinator,
    });
    this.taskRunner = new TaskRunner({
      stateStore,
      roleRegistry,
      config,
      logger,
      telemetry: this.telemetry,
      roleRunner: this.roleRunner,
      policyDecisionRecorder,
      runStepRecorder,
      failureHandler,
      gitLifecycleCoordinator,
    });
  }

  async runCycle(options: RunCycleOptions = {}): Promise<RunCycleResult> {
    this.roleRunner.resetRunCost();
    const runId = crypto.randomUUID();
    const state = await this.stateStore.load();
    const lockHandle = await this.lockAuthority.acquireRunLock('global-run-cycle', {
      tenantId: state.orgId,
      projectId: state.projectId,
    });
    if (!lockHandle) {
      await this.recordRunLockContention(runId, { lock_resource: 'global-run-cycle' });
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
    const fencingHandle = await this.fencingTokenGuard.acquire('global-run-cycle', runId, new Date().toISOString());
    if (!fencingHandle) {
      await lockHandle.release();
      await this.recordRunLockContention(runId, {
        lock_resource: 'global-run-cycle',
        lock_phase: 'fencing',
      });
      this.logger.info('Run cycle skipped because fencing lock is unavailable', {
        event: 'cycle_idle_fencing_unavailable',
        runId,
        data: { resource: 'global-run-cycle', delta: 1 },
      });
      return { runId, status: 'idle', stopReason: 'run_lock_unavailable' };
    }

    try {
      const fencingValidation = await fencingHandle.validate(new Date().toISOString());
      if (!fencingValidation.valid) {
        throw new WorkflowPolicyError('Fencing lock validation failed before cycle execution', {
          details: {
            runId,
            reason: fencingValidation.reason,
            resource: 'global-run-cycle',
            fencingToken: fencingHandle.lease.fencingToken,
          },
        });
      }
      assertProjectState(state);

      const stop = shouldStopRun(state, this.config.workflow);
      if (stop.stop) {
        return {
          runId: state.execution.activeRunId ?? crypto.randomUUID(),
          status: 'idle',
          ...(stop.reason ? { stopReason: stop.reason } : {}),
        };
      }

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

      return await this.workspaceRunCoordinator.run({
        state,
        task,
        runId,
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        execute: async (workspaceContext) => this.taskRunner.run(workspaceContext),
      });
    } finally {
      await fencingHandle.release();
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

  private async selectNextTask(state: ProjectState, runId: string): Promise<BacklogTask | null> {
    const taskManager = this.roleRegistry.get<{ state: ProjectState }, BacklogTask | null>('task_manager');
    const taskSelection = await this.roleRunner.execute(taskManager, {
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

  private async recordRunLockContention(runId: string, tags: Record<string, string>): Promise<void> {
    await this.telemetry.incrementCounter({
      name: 'run_lock_contention_total',
      value: 1,
      runId,
      tags,
    });
  }
}
