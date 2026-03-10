import type { ProjectState } from '../../core/src/index.ts';

export interface StateSummaryView {
  projectId: string;
  projectName: string;
  summary: string;
  currentMilestoneId?: string;
  health: ProjectState['repoHealth'];
  counts: {
    milestones: number;
    tasks: number;
    failures: number;
    architectureFindings: number;
    completedTasks: number;
    blockedTasks: number;
  };
}

export interface BacklogExportView {
  markdown: string;
  json: string;
}

export function toStateSummaryView(state: ProjectState): StateSummaryView {
  return {
    projectId: state.projectId,
    projectName: state.projectName,
    summary: state.summary,
    ...(state.currentMilestoneId ? { currentMilestoneId: state.currentMilestoneId } : {}),
    health: state.repoHealth,
    counts: {
      milestones: Object.keys(state.milestones).length,
      tasks: Object.keys(state.backlog.tasks).length,
      failures: state.failures.length,
      architectureFindings: state.architecture.findings.length,
      completedTasks: state.execution.completedTaskIds.length,
      blockedTasks: state.execution.blockedTaskIds.length,
    },
  };
}

export function toBacklogExportView(state: ProjectState): BacklogExportView {
  const lines = ['# Backlog export', ''];

  for (const epic of Object.values(state.backlog.epics)) {
    lines.push(`## ${epic.title}`);
    lines.push(epic.goal);
    lines.push('');

    for (const featureId of epic.featureIds) {
      const feature = state.backlog.features[featureId];
      if (!feature) {
        continue;
      }

      lines.push(`### ${feature.title}`);
      lines.push(feature.outcome);
      lines.push('');

      for (const taskId of feature.taskIds) {
        const task = state.backlog.tasks[taskId];
        if (!task) {
          continue;
        }

        lines.push(`- [${task.status === 'done' ? 'x' : ' '}] ${task.title} (${task.priority})`);
      }

      lines.push('');
    }
  }

  return {
    markdown: `${lines.join('\n').trim()}\n`,
    json: JSON.stringify(state.backlog, null, 2),
  };
}
