import type { ProjectState } from './project-state.ts';

export type MilestoneStatus = 'todo' | 'in_progress' | 'done' | 'blocked';

export interface Milestone {
  id: string;
  title: string;
  goal: string;
  status: MilestoneStatus;
  epicIds: string[];
  entryCriteria: string[];
  exitCriteria: string[];
}

export function getActiveMilestone(state: ProjectState): Milestone | undefined {
  if (!state.currentMilestoneId) {
    return undefined;
  }

  return state.milestones[state.currentMilestoneId];
}

export function canEnterMilestone(_state: ProjectState, milestone: Milestone): boolean {
  return milestone.entryCriteria.every((criterion) => criterion.trim().length > 0);
}

export function isMilestoneComplete(state: ProjectState, milestone: Milestone): boolean {
  const milestoneFeatureIds = milestone.epicIds.flatMap(
    (epicId) => state.backlog.epics[epicId]?.featureIds ?? [],
  );

  const milestoneTaskIds = milestoneFeatureIds.flatMap(
    (featureId) => state.backlog.features[featureId]?.taskIds ?? [],
  );

  return (
    milestone.exitCriteria.length > 0 &&
    milestoneTaskIds.every((taskId) => state.execution.completedTaskIds.includes(taskId))
  );
}
