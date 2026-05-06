import type { BacklogTask, ProjectState } from '@ai-orchestrator/core';
import { makeEvent } from '@ai-orchestrator/core';
import type { StateStore } from '@ai-orchestrator/state';
import type { RuntimeConfig } from '@ai-orchestrator/shared';
import {
  nextFailureAction,
  splitTaskForRetry,
} from '@ai-orchestrator/workflow';

import type { RunCycleResult } from '../run-cycle-types.js';
import { makeArtifact } from '../runtime-utils.js';
import type { RunStepRecorder } from '../persistence/run-step-recorder.js';

export type RuntimeFailureRole = 'reviewer' | 'tester';

export interface HandleTaskFailureInput {
  state: ProjectState;
  task: BacklogTask;
  role: RuntimeFailureRole;
  reason: string;
  runId: string;
}

export class FailureHandler {
  constructor(
    private readonly input: {
      stateStore: StateStore;
      config: RuntimeConfig;
      runStepRecorder: RunStepRecorder;
    },
  ) {}

  async handle(input: HandleTaskFailureInput): Promise<RunCycleResult> {
    const { state, task, role, reason, runId } = input;
    const retryCount = state.execution.retryCounts[task.id] ?? 0;
    const action = nextFailureAction(task, retryCount, this.input.config.workflow.maxRetriesPerTask);
    const now = new Date().toISOString();

    const failureResult = await this.input.stateStore.recordFailure({
      taskId: task.id,
      role,
      reason,
      retrySuggested: action !== 'block',
      status: action === 'block' ? 'dead_lettered' : 'retryable',
      checkpointRunId: runId,
      ...(action === 'block' ? { deadLetteredAt: now } : {}),
    }, { expectedRevision: state.revision });
    const { failure } = failureResult;
    state.revision = failureResult.revision;
    state.failures.push(failure);
    state.execution.retryCounts[task.id] = (state.execution.retryCounts[task.id] ?? 0) + 1;
    delete state.execution.activeTaskId;
    this.input.runStepRecorder.flushToState(state);

    if (action === 'split') {
      return this.splitTaskForFailure(state, task, reason, runId);
    }

    if (action === 'block') {
      return this.blockTaskForFailure(state, task, reason, runId);
    }

    await this.input.stateStore.save(state, { expectedRevision: state.revision });
    return { runId, taskId: task.id, status: 'idle', stopReason: reason };
  }

  private async splitTaskForFailure(
    state: ProjectState,
    task: BacklogTask,
    reason: string,
    runId: string,
  ): Promise<RunCycleResult> {
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
    await this.input.stateStore.saveWithEvents(state, [taskSplitEvent], { expectedRevision: state.revision });
    return { runId, taskId: task.id, status: 'idle', stopReason: 'task_split' };
  }

  private async blockTaskForFailure(
    state: ProjectState,
    task: BacklogTask,
    reason: string,
    runId: string,
  ): Promise<RunCycleResult> {
    task.status = 'blocked';
    if (!state.execution.blockedTaskIds.includes(task.id)) {
      state.execution.blockedTaskIds.push(task.id);
    }
    const artifact = makeArtifact('report', `Escalation for ${task.id}`, {
      taskId: task.id,
      reason,
    });
    state.artifacts.push(artifact);
    const artifactResult = await this.input.stateStore.recordArtifact(artifact, { expectedRevision: state.revision });
    state.revision = artifactResult.revision;
    const taskBlockedEvent = makeEvent('TASK_BLOCKED', { taskId: task.id, reason }, { runId });
    await this.input.stateStore.saveWithEvents(state, [taskBlockedEvent], { expectedRevision: state.revision });
    return { runId, taskId: task.id, status: 'blocked', stopReason: reason };
  }
}

export function rewriteSupersededDependencies(
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
