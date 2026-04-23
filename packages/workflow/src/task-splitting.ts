import type { BacklogTask, Priority } from '../../core/src/backlog.ts';

export interface SplitTaskPlan {
  parentTaskId: string;
  completionTaskId: string;
  childTasks: [BacklogTask, BacklogTask];
  rationale: string;
}

export function splitTaskForRetry(task: BacklogTask, reason: string): SplitTaskPlan {
  const [firstCriteria, secondCriteria] = splitAcceptanceCriteria(task.acceptanceCriteria);
  const firstChildId = `${task.id}--part-1`;
  const secondChildId = `${task.id}--part-2`;

  const firstChild: BacklogTask = {
    ...task,
    id: firstChildId,
    splitFromTaskId: task.id,
    title: `${task.title} [part 1]`,
    priority: boostPriority(task.priority),
    dependsOn: [...task.dependsOn],
    acceptanceCriteria: firstCriteria,
    status: 'todo',
  };
  const secondChild: BacklogTask = {
    ...task,
    id: secondChildId,
    splitFromTaskId: task.id,
    title: `${task.title} [part 2]`,
    priority: boostPriority(task.priority),
    dependsOn: [firstChildId],
    acceptanceCriteria: secondCriteria,
    status: 'todo',
  };

  return {
    parentTaskId: task.id,
    completionTaskId: secondChildId,
    childTasks: [firstChild, secondChild],
    rationale: `Task ${task.id} was split after repeated failure: ${reason}`,
  };
}

function splitAcceptanceCriteria(criteria: string[]): [string[], string[]] {
  if (criteria.length <= 1) {
    return [
      ['Implement the narrowest viable change for the parent task'],
      [...criteria, 'Validate the remaining integration path after the narrow change'],
    ];
  }

  const midpoint = Math.ceil(criteria.length / 2);
  return [criteria.slice(0, midpoint), criteria.slice(midpoint)];
}

function boostPriority(priority: Priority): Priority {
  if (priority === 'p3') {
    return 'p2';
  }

  if (priority === 'p2') {
    return 'p1';
  }

  return priority;
}
