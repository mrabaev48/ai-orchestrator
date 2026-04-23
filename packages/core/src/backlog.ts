export type BacklogTaskKind =
  | 'bootstrap'
  | 'analysis'
  | 'architecture'
  | 'planning'
  | 'implementation'
  | 'review'
  | 'testing'
  | 'documentation'
  | 'release';

export type BacklogTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'review'
  | 'testing'
  | 'done'
  | 'blocked'
  | 'superseded';
export type Priority = 'p0' | 'p1' | 'p2' | 'p3';
export type EstimatedRisk = 'low' | 'medium' | 'high';

export interface Epic {
  id: string;
  title: string;
  goal: string;
  status: Exclude<BacklogTaskStatus, 'review' | 'testing'>;
  featureIds: string[];
}

export interface Feature {
  id: string;
  epicId: string;
  title: string;
  outcome: string;
  risks: string[];
  taskIds: string[];
}

export interface BacklogTask {
  id: string;
  featureId: string;
  splitFromTaskId?: string;
  title: string;
  kind: BacklogTaskKind;
  status: BacklogTaskStatus;
  priority: Priority;
  dependsOn: string[];
  acceptanceCriteria: string[];
  affectedModules: string[];
  estimatedRisk: EstimatedRisk;
}

export interface Backlog {
  epics: Record<string, Epic>;
  features: Record<string, Feature>;
  tasks: Record<string, BacklogTask>;
}

export function priorityWeight(priority: Priority): number {
  return {
    p0: 400,
    p1: 300,
    p2: 200,
    p3: 100,
  }[priority];
}

export function validateBacklogTask(task: BacklogTask): string[] {
  const issues: string[] = [];

  if (task.acceptanceCriteria.length === 0) {
    issues.push(`Task ${task.id} must declare acceptance criteria`);
  }

  if (!task.kind) {
    issues.push(`Task ${task.id} must declare a kind`);
  }

  if (task.splitFromTaskId === task.id) {
    issues.push(`Task ${task.id} cannot split from itself`);
  }

  return issues;
}

export function isExecutableTask(
  completedTaskIds: Set<string>,
  blockedTaskIds: Set<string>,
  task: BacklogTask,
): boolean {
  if (task.status !== 'todo') {
    return false;
  }

  if (blockedTaskIds.has(task.id)) {
    return false;
  }

  if (validateBacklogTask(task).length > 0) {
    return false;
  }

  return task.dependsOn.every((dependency) => completedTaskIds.has(dependency));
}
