import { z } from 'zod';

import { StateIntegrityError } from '../../shared/src/index.ts';
import type { ArchitectureFinding } from './architecture-findings.ts';
import { validateArchitectureFinding } from './architecture-findings.ts';
import type { ArtifactRecord } from './artifacts.ts';
import type { Backlog } from './backlog.ts';
import { validateBacklogTask } from './backlog.ts';
import type { DecisionLogItem } from './decisions.ts';
import {
  createEmptyProjectDiscovery,
  type ProjectDiscovery,
  validateProjectDiscovery,
} from './discovery.ts';
import type { FailureRecord } from './failures.ts';
import type { Milestone } from './milestones.ts';

export interface ProjectArchitecture {
  packageMap: Record<string, string[]>;
  subsystemMap: Record<string, string[]>;
  unstableAreas: string[];
  criticalPaths: string[];
  findings: ArchitectureFinding[];
  analysisSummary?: string;
}

export interface RepoHealth {
  build: 'unknown' | 'passing' | 'failing';
  tests: 'unknown' | 'passing' | 'failing';
  lint: 'unknown' | 'passing' | 'failing';
  typecheck: 'unknown' | 'passing' | 'failing';
}

export interface ExecutionState {
  activeTaskId?: string;
  activeRunId?: string;
  completedTaskIds: string[];
  blockedTaskIds: string[];
  retryCounts: Record<string, number>;
  stepCount: number;
}

export interface ProjectState {
  projectId: string;
  projectName: string;
  summary: string;
  currentMilestoneId?: string;
  architecture: ProjectArchitecture;
  discovery: ProjectDiscovery;
  repoHealth: RepoHealth;
  backlog: Backlog;
  execution: ExecutionState;
  milestones: Record<string, Milestone>;
  decisions: DecisionLogItem[];
  failures: FailureRecord[];
  artifacts: ArtifactRecord[];
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

const backlogTaskSchema = z.object({
  id: z.string().min(1),
  featureId: z.string().min(1),
  splitFromTaskId: z.string().min(1).optional(),
  title: z.string().min(1),
  kind: z.enum([
    'bootstrap',
    'analysis',
    'architecture',
    'planning',
    'implementation',
    'review',
    'testing',
    'documentation',
    'release',
  ]),
  status: z.enum(['todo', 'in_progress', 'review', 'testing', 'done', 'blocked', 'superseded']),
  priority: z.enum(['p0', 'p1', 'p2', 'p3']),
  dependsOn: z.array(z.string().min(1)),
  acceptanceCriteria: z.array(z.string().min(1)),
  affectedModules: z.array(z.string().min(1)),
  estimatedRisk: z.enum(['low', 'medium', 'high']),
});

const epicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked', 'superseded']),
  featureIds: z.array(z.string().min(1)),
});

const featureSchema = z.object({
  id: z.string().min(1),
  epicId: z.string().min(1),
  title: z.string().min(1),
  outcome: z.string().min(1),
  risks: z.array(z.string().min(1)),
  taskIds: z.array(z.string().min(1)),
});

const milestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']),
  epicIds: z.array(z.string().min(1)),
  entryCriteria: z.array(z.string()),
  exitCriteria: z.array(z.string()),
});

const decisionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  affectedAreas: z.array(z.string().min(1)),
  createdAt: z.iso.datetime({ offset: true }),
});

const failureSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  role: z.enum([
    'bootstrap_analyst',
    'architect',
    'planner',
    'release_auditor',
    'state_steward',
    'integration_manager',
    'task_manager',
    'prompt_engineer',
    'coder',
    'reviewer',
    'tester',
    'docs_writer',
  ]),
  reason: z.string().min(1),
  symptoms: z.array(z.string().min(1)),
  badPatterns: z.array(z.string().min(1)),
  retrySuggested: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
});

const artifactSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'bootstrap_analysis',
    'architecture_analysis',
    'documentation',
    'release_assessment',
    'state_integrity_report',
    'integration_export',
    'optimized_prompt',
    'run_summary',
    'backlog_export',
    'plan',
    'test_plan',
    'report',
    'git_lifecycle',
  ]),
  title: z.string().min(1),
  location: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string().min(1)),
  createdAt: z.iso.datetime({ offset: true }),
});

const projectStateDeepSchema = z.object({
  backlog: z.object({
    epics: z.record(z.string(), epicSchema),
    features: z.record(z.string(), featureSchema),
    tasks: z.record(z.string(), backlogTaskSchema),
  }),
  milestones: z.record(z.string(), milestoneSchema),
  decisions: z.array(decisionSchema),
  failures: z.array(failureSchema),
  artifacts: z.array(artifactSchema),
});

function toPath(path: PropertyKey[]): string {
  if (path.length === 0) {
    return 'projectState';
  }

  return path
    .map((segment) => {
      if (typeof segment === 'number') {
        return `[${segment}]`;
      }
      if (typeof segment === 'symbol') {
        return segment.toString();
      }
      return segment;
    })
    .join('.');
}

export function createEmptyProjectState(input: {
  projectId: string;
  projectName: string;
  summary: string;
}): ProjectState {
  return {
    projectId: input.projectId,
    projectName: input.projectName,
    summary: input.summary,
    architecture: {
      packageMap: {},
      subsystemMap: {},
      unstableAreas: [],
      criticalPaths: [],
      findings: [],
    },
    discovery: createEmptyProjectDiscovery(),
    repoHealth: {
      build: 'unknown',
      tests: 'unknown',
      lint: 'unknown',
      typecheck: 'unknown',
    },
    backlog: {
      epics: {},
      features: {},
      tasks: {},
    },
    execution: {
      completedTaskIds: [],
      blockedTaskIds: [],
      retryCounts: {},
      stepCount: 0,
    },
    milestones: {},
    decisions: [],
    failures: [],
    artifacts: [],
  };
}

export function validateProjectState(state: ProjectState): ValidationResult {
  const issues: string[] = [];
  const deepValidation = projectStateDeepSchema.safeParse(state);

  if (!deepValidation.success) {
    issues.push(
      ...deepValidation.error.issues.map((issue) => {
        const issuePath = toPath(issue.path);
        return `${issuePath}: ${issue.message}`;
      }),
    );
  }

  issues.push(...validateProjectDiscovery(state.discovery));
  issues.push(...state.architecture.findings.flatMap((finding) => validateArchitectureFinding(finding)));

  if (state.architecture.analysisSummary != null && !state.architecture.analysisSummary.trim()) {
    issues.push('Architecture analysisSummary must not be empty when present');
  }

  if (state.currentMilestoneId && !state.milestones[state.currentMilestoneId]) {
    issues.push(`currentMilestoneId references missing milestone: ${state.currentMilestoneId}`);
  }

  if (state.execution.activeTaskId && !state.backlog.tasks[state.execution.activeTaskId]) {
    issues.push(`activeTaskId references missing task: ${state.execution.activeTaskId}`);
  }

  for (const feature of Object.values(state.backlog.features)) {
    if (!state.backlog.epics[feature.epicId]) {
      issues.push(`Feature ${feature.id} references missing epic ${feature.epicId}`);
    }

    for (const taskId of feature.taskIds) {
      const task = state.backlog.tasks[taskId];
      if (!task) {
        issues.push(`Feature ${feature.id} references missing task ${taskId}`);
      } else if (task.featureId !== feature.id) {
        issues.push(`Task ${task.id} featureId does not match feature ${feature.id}`);
      }
    }
  }

  for (const epic of Object.values(state.backlog.epics)) {
    for (const featureId of epic.featureIds) {
      if (!state.backlog.features[featureId]) {
        issues.push(`Epic ${epic.id} references missing feature ${featureId}`);
      }
    }
  }

  for (const task of Object.values(state.backlog.tasks)) {
    issues.push(...validateBacklogTask(task));
    if (task.splitFromTaskId && !state.backlog.tasks[task.splitFromTaskId]) {
      issues.push(`Task ${task.id} splitFromTaskId references missing task ${task.splitFromTaskId}`);
    }
    for (const dependency of task.dependsOn) {
      if (!state.backlog.tasks[dependency]) {
        issues.push(`Task ${task.id} depends on missing task ${dependency}`);
      }
    }
  }

  const inProgressMilestones = Object.values(state.milestones).filter(
    (milestone) => milestone.status === 'in_progress',
  );
  if (inProgressMilestones.length > 1) {
    issues.push('Only one milestone may be in_progress');
  }

  for (const blockedTaskId of state.execution.blockedTaskIds) {
    const task = state.backlog.tasks[blockedTaskId];
    if (!task) {
      issues.push(`Blocked task reference is missing: ${blockedTaskId}`);
      continue;
    }

    if (task.status !== 'blocked') {
      issues.push(`Blocked task ${blockedTaskId} must have blocked status`);
    }

    const hasFailure = state.failures.some((failure) => failure.taskId === blockedTaskId);
    const hasArtifact = state.artifacts.some(
      (artifact) => artifact.metadata.taskId === blockedTaskId,
    );
    if (!hasFailure && !hasArtifact) {
      issues.push(`Blocked task ${blockedTaskId} requires a failure or artifact record`);
    }
  }

  for (const completedTaskId of state.execution.completedTaskIds) {
    const task = state.backlog.tasks[completedTaskId];
    if (!task) {
      issues.push(`Completed task reference is missing: ${completedTaskId}`);
      continue;
    }

    if (task.status !== 'done') {
      issues.push(`Completed task ${completedTaskId} must have done status`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function assertProjectState(state: ProjectState): void {
  const validation = validateProjectState(state);
  if (!validation.ok) {
    throw new StateIntegrityError('Project state failed validation', {
      details: validation.issues,
    });
  }
}
