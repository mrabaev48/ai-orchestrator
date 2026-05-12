import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

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
import {
  createExecutionLeaseAuthority,
  type ExecutionLeaseAuthority,
  type ExecutionLeaseGuard,
  type ExecutionLeaseHandle,
} from './leases/execution-lease-authority.js';
import { createLeaseProtectedStateStore } from './leases/lease-protected-state-store.js';

export type {
  RunCycleOptions,
  RunCycleResult,
  RunSingleTaskErrorReason,
} from './run-cycle-types.js';

export interface OrchestratorOverrides {
  executionLeaseAuthority?: ExecutionLeaseAuthority;
  telemetry?: ExecutionTelemetry;
  workspaceManager?: WorkspaceManager;
}

export class Orchestrator {
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly config: RuntimeConfig;
  private readonly logger: Logger;
  private readonly executionLeaseAuthority: ExecutionLeaseAuthority;
  private readonly leaseContext = new AsyncLocalStorage<ExecutionLeaseHandle>();
  private readonly leaseGuard: ExecutionLeaseGuard;
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
    this.executionLeaseAuthority = overrides?.executionLeaseAuthority ?? createExecutionLeaseAuthority(config, logger);
    this.leaseGuard = {
      requireValid: async () => {
        const lease = this.leaseContext.getStore();
        if (lease) {
          await lease.requireValid();
        }
      },
    };
    const guardedStateStore = createLeaseProtectedStateStore(stateStore, this.leaseGuard);
    this.telemetry = overrides?.telemetry ?? new StateStoreExecutionTelemetry(guardedStateStore, logger);
    const workspaceManager = overrides?.workspaceManager
      ?? createWorkspaceManager({
        mode: config.workflow.workspaceManagerMode ?? 'git-worktree',
        repoRoot: config.tools.allowedWritePaths[0] ?? process.cwd(),
        branchTtlHours: config.workflow.workspaceBranchTtlHours ?? 24,
      });

    const runStepRecorder = new RunStepRecorder(guardedStateStore);
    const policyDecisionRecorder = new PolicyDecisionRecorder(guardedStateStore);
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
      stateStore: guardedStateStore,
      config,
      telemetry: this.telemetry,
      runStepRecorder,
      costTracker: new RoleRunCostTracker(),
      tools: defaultTools,
      leaseGuard: this.leaseGuard,
    });
    const failureHandler = new FailureHandler({
      stateStore: guardedStateStore,
      config,
      runStepRecorder,
    });
    const gitLifecycleCoordinator = new GitLifecycleCoordinator({
      stateStore: guardedStateStore,
      config,
      policyDecisionRecorder,
      leaseGuard: this.leaseGuard,
    });
    this.workspaceRunCoordinator = new WorkspaceRunCoordinator({
      stateStore: guardedStateStore,
      config,
      workspaceManager,
      gitLifecycleCoordinator,
    });
    this.taskRunner = new TaskRunner({
      stateStore: guardedStateStore,
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
    const executionLease = await this.executionLeaseAuthority.acquireRunLease({
      resource: 'global-run-cycle',
      ownerId: runId,
      scope: {
        tenantId: state.orgId,
        projectId: state.projectId,
      },
    });
    if (!executionLease) {
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

    const leaseAbortController = this.createLeaseAbortController(options.abortSignal);
    const heartbeat = this.startExecutionLeaseHeartbeat(executionLease, leaseAbortController, runId);
    try {
      return await this.leaseContext.run(executionLease, async () => {
        await executionLease.requireValid();
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
          abortSignal: leaseAbortController.signal,
          execute: async (workspaceContext) => this.taskRunner.run(workspaceContext),
        });
      });
    } finally {
      await heartbeat.stop();
      leaseAbortController.cleanup();
      await this.releaseExecutionLease(executionLease, runId);
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
    state.revision = (await this.stateStore.load()).revision;

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

  private createLeaseAbortController(parentSignal?: AbortSignal): AbortController & { cleanup: () => void } {
    const controller = new AbortController() as AbortController & { cleanup: () => void };
    let cleanup = (): void => undefined;
    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason);
    } else if (parentSignal) {
      const onAbort = (): void => {
        controller.abort(parentSignal.reason);
      };
      parentSignal.addEventListener('abort', onAbort, { once: true });
      cleanup = () => {
        parentSignal.removeEventListener('abort', onAbort);
      };
    }
    controller.cleanup = cleanup;
    return controller;
  }

  private startExecutionLeaseHeartbeat(
    lease: ExecutionLeaseHandle,
    abortController: AbortController,
    runId: string,
  ): { stop: () => Promise<void> } {
    const ttlMs = this.config.workflow.fencingTtlMs ?? 60_000;
    const intervalMs = Math.max(1, Math.floor(ttlMs / 2));
    let inFlight: Promise<void> | null = null;
    let isStopped = false;

    const failLease = (error: unknown): void => {
      const leaseError = error instanceof WorkflowPolicyError
        ? error
        : new WorkflowPolicyError('Execution lease renewal failed', {
          cause: error,
          details: {
            runId,
            resource: lease.resource,
            fencingToken: lease.lease.fencingToken,
          },
          retrySuggested: true,
        });
      if (!abortController.signal.aborted) {
        abortController.abort(leaseError);
      }
    };

    const renew = async (): Promise<void> => {
      if (isStopped) {
        return;
      }
      const result = await lease.renew();
      if (!result.renewed) {
        failLease(new WorkflowPolicyError('Execution lease renewal failed', {
          details: {
            runId,
            resource: lease.resource,
            fencingToken: lease.lease.fencingToken,
            reason: result.reason,
          },
          retrySuggested: true,
        }));
      }
    };

    const timer = setInterval(() => {
      inFlight = renew().catch(failLease);
    }, intervalMs);
    timer.unref();

    return {
      stop: async () => {
        isStopped = true;
        clearInterval(timer);
        await inFlight?.catch(() => undefined);
      },
    };
  }

  private async releaseExecutionLease(lease: ExecutionLeaseHandle, runId: string): Promise<void> {
    try {
      await lease.release();
    } catch (error) {
      this.logger.warn('Unable to release execution lease during run cleanup', {
        event: 'execution_lease_release_failed',
        runId,
        data: {
          resource: lease.resource,
          fencingToken: lease.lease.fencingToken,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
