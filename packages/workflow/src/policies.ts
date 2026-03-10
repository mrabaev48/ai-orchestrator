import type { BacklogTask } from '../../core/src/backlog.ts';
import { isExecutableTask, priorityWeight } from '../../core/src/backlog.ts';
import type { ProjectState } from '../../core/src/project-state.ts';
import type { ReviewResult } from '../../core/src/review.ts';
import type { AgentRoleName } from '../../core/src/roles.ts';
import type { TestExecutionResult } from '../../core/src/testing.ts';

export interface StopConditionResult {
  stop: boolean;
  reason?: string;
}

export function shouldStopRun(
  state: ProjectState,
  limits: { maxStepsPerRun: number; maxRetriesPerTask: number },
): StopConditionResult {
  if (state.execution.stepCount >= limits.maxStepsPerRun) {
    return { stop: true, reason: 'max_steps_per_run_reached' };
  }

  if (
    state.execution.activeTaskId &&
    (state.execution.retryCounts[state.execution.activeTaskId] ?? 0) >= limits.maxRetriesPerTask
  ) {
    return { stop: true, reason: 'max_retries_reached' };
  }

  return { stop: false };
}

export function selectNextTask(state: ProjectState): BacklogTask | undefined {
  const completed = new Set(state.execution.completedTaskIds);
  const blocked = new Set(state.execution.blockedTaskIds);

  return Object.values(state.backlog.tasks)
    .filter((task) => isExecutableTask(completed, blocked, task))
    .sort((left, right) => {
      const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const retryDelta =
        (state.execution.retryCounts[left.id] ?? 0) - (state.execution.retryCounts[right.id] ?? 0);
      if (retryDelta !== 0) {
        return retryDelta;
      }

      return left.id.localeCompare(right.id);
    })[0];
}

export function routeTaskToRole(task: BacklogTask): AgentRoleName {
  switch (task.kind) {
    case 'architecture':
      return 'architect';
    case 'planning':
      return 'planner';
    case 'documentation':
      return 'docs_writer';
    case 'testing':
      return 'tester';
    default:
      return 'coder';
  }
}

export function requiresReview(task: BacklogTask): boolean {
  return task.kind !== 'documentation';
}

export function requiresTesting(task: BacklogTask): boolean {
  return task.kind === 'implementation' || task.kind === 'testing';
}

export function nextFailureAction(
  retryCount: number,
  maxRetriesPerTask: number,
): 'retry' | 'block' {
  return retryCount + 1 >= maxRetriesPerTask ? 'block' : 'retry';
}

export function isReviewApproved(result: ReviewResult): boolean {
  return result.approved && result.blockingIssues.length === 0;
}

export function isTestPassed(result: TestExecutionResult): boolean {
  return result.passed && result.failures.length === 0;
}
