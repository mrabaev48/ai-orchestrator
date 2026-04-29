import { validateArchitectureFinding, type ArchitectureAnalysis } from './architecture-findings.ts';
import { validateBacklogTask, type BacklogTask } from './backlog.ts';
import { validateProjectDiscovery, type ProjectDiscovery } from './discovery.ts';
import {
  validateIntegrationExportPayload,
  type IntegrationExportPayload,
} from './integration-export.ts';
import { validateReleaseAssessment, type ReleaseAssessment } from './release-assessment.ts';
import type { ReviewResult } from './review.ts';
import { validateStateIntegrityAssessment, type StateIntegrityAssessment } from './state-integrity.ts';
import type { TestExecutionResult } from './testing.ts';
import type { AgentRoleName, RoleResponse } from './roles.ts';
import type { Backlog } from './backlog.ts';
import type { Milestone } from './milestones.ts';

type PlannerOutput = {
  milestone: Milestone;
  backlog: Backlog;
  summary: string;
  dependencyEdges: {
    fromId: string;
    toId: string;
    type: 'contains' | 'depends_on';
    rationale: string;
  }[];
  assumptions: string[];
  risks: {
    id: string;
    title: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation: string;
    relatedIds: string[];
  }[];
  mergePreview: {
    batches: {
      id: string;
      taskIds: string[];
      rationale: string;
    }[];
    notes: string[];
  };
};
type DocsWriterOutput = {
  summary: string;
  affectedModules: string[];
  behaviorChanges: string[];
  designRationale: string[];
  followUpGaps: string[];
  markdown: string;
};
type CoderOutput = { changed: boolean; summary: string };
type OptimizedPrompt = {
  id: string;
  role: AgentRoleName;
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  constraints: string[];
  outputSchema: Record<string, unknown>;
};

type RoleOutputValidator = (output: unknown) => string[];

const ROLE_OUTPUT_SCHEMAS: Record<AgentRoleName, Record<string, unknown>> = {
  bootstrap_analyst: {
    type: 'object',
    required: ['generatedAt', 'packageMap', 'subsystemMap', 'packageInventory', 'entryPoints', 'testInfrastructure', 'healthObservations', 'unstableAreaCandidates', 'criticalPaths', 'recommendedNextStep'],
  },
  architect: {
    type: 'object',
    required: ['findings', 'riskSummary'],
  },
  planner: {
    type: 'object',
    required: ['milestone', 'backlog', 'summary', 'dependencyEdges', 'assumptions', 'risks', 'mergePreview'],
  },
  release_auditor: {
    type: 'object',
    required: ['verdict', 'confidence', 'blockers', 'warnings', 'evidence', 'recommendedNextActions'],
  },
  state_steward: {
    type: 'object',
    required: ['ok', 'findings', 'summary'],
  },
  integration_manager: {
    type: 'object',
    required: ['integrationTarget', 'mappedEntities', 'missingRequiredFields', 'exportBlockers', 'recommendedFixes'],
  },
  task_manager: {
    anyOf: [{ type: 'null' }, { type: 'object' }],
  },
  prompt_engineer: {
    type: 'object',
    required: ['id', 'role', 'systemPrompt', 'taskPrompt', 'contextSummary', 'constraints', 'outputSchema'],
  },
  coder: {
    type: 'object',
    required: ['changed', 'summary'],
  },
  reviewer: {
    type: 'object',
    required: ['approved', 'blockingIssues', 'nonBlockingSuggestions', 'missingTests', 'notes'],
  },
  tester: {
    type: 'object',
    required: ['passed', 'testPlan', 'evidence', 'failures', 'missingCoverage'],
  },
  docs_writer: {
    type: 'object',
    required: ['summary', 'affectedModules', 'behaviorChanges', 'designRationale', 'followUpGaps', 'markdown'],
  },
};

const ROLE_OUTPUT_VALIDATORS: Record<AgentRoleName, RoleOutputValidator> = {
  bootstrap_analyst: (output) => validateProjectDiscovery(output as ProjectDiscovery),
  architect: (output) => validateArchitectureAnalysis(output as ArchitectureAnalysis),
  planner: (output) => validatePlannerOutput(output as PlannerOutput),
  release_auditor: (output) => validateReleaseAssessment(output as ReleaseAssessment),
  state_steward: (output) => validateStateIntegrityAssessment(output as StateIntegrityAssessment),
  integration_manager: (output) => validateIntegrationExportPayload(output as IntegrationExportPayload),
  task_manager: (output) => validateTaskManagerOutput(output as BacklogTask | null),
  prompt_engineer: (output) => validateOptimizedPrompt(output as OptimizedPrompt),
  coder: (output) => validateCoderOutput(output as CoderOutput),
  reviewer: (output) => validateReviewOutput(output as ReviewResult),
  tester: (output) => validateTestOutput(output as TestExecutionResult),
  docs_writer: (output) => validateDocsWriterOutput(output as DocsWriterOutput),
};

export class RoleOutputSchemaRegistry {
  getSchema(role: AgentRoleName): Record<string, unknown> {
    return ROLE_OUTPUT_SCHEMAS[role];
  }

  validate(role: AgentRoleName, output: unknown): string[] {
    const validator = ROLE_OUTPUT_VALIDATORS[role];
    return validator(output);
  }
}

export const defaultRoleOutputSchemaRegistry = new RoleOutputSchemaRegistry();

export function validateRoleResponse(role: AgentRoleName, response: RoleResponse<unknown>): string[] {
  const issues: string[] = [];
  if (response.role !== role) {
    issues.push(`Role response role mismatch: expected ${role}, got ${response.role}`);
  }
  if (!response.summary.trim()) {
    issues.push('Role response summary is required');
  }
  if (response.confidence < 0 || response.confidence > 1) {
    issues.push('Role response confidence must be between 0 and 1');
  }
  if (!Array.isArray(response.warnings) || !Array.isArray(response.risks)) {
    issues.push('Role response warnings and risks must be arrays');
  }
  return issues;
}

function validateArchitectureAnalysis(output: ArchitectureAnalysis): string[] {
  const issues: string[] = [];
  if (!output.riskSummary?.trim()) {
    issues.push('Architecture analysis riskSummary is required');
  }
  for (const finding of output.findings ?? []) {
    issues.push(...validateArchitectureFinding(finding));
  }
  return issues;
}

function validatePlannerOutput(output: PlannerOutput): string[] {
  const issues: string[] = [];
  if (!output.summary?.trim()) {
    issues.push('Planner summary is required');
  }
  if (!output.milestone?.id?.trim()) {
    issues.push('Planner milestone.id is required');
  }
  for (const task of Object.values(output.backlog?.tasks ?? {})) {
    issues.push(...validateBacklogTask(task));
  }
  if (!Array.isArray(output.dependencyEdges) || output.dependencyEdges.length === 0) {
    issues.push('Planner dependencyEdges must be a non-empty array');
  }
  if (!Array.isArray(output.assumptions) || output.assumptions.length === 0) {
    issues.push('Planner assumptions must be a non-empty array');
  }
  if (!Array.isArray(output.risks)) {
    issues.push('Planner risks must be an array');
  }
  if (!output.mergePreview || !Array.isArray(output.mergePreview.batches) || output.mergePreview.batches.length === 0) {
    issues.push('Planner mergePreview.batches must be a non-empty array');
  }
  return issues;
}

function validateTaskManagerOutput(output: BacklogTask | null): string[] {
  if (output == null) {
    return [];
  }
  return validateBacklogTask(output);
}

function validateOptimizedPrompt(output: OptimizedPrompt): string[] {
  const issues: string[] = [];
  if (!output.id?.trim()) issues.push('Prompt id is required');
  if (!output.systemPrompt?.trim()) issues.push('Prompt systemPrompt is required');
  if (!output.taskPrompt?.trim()) issues.push('Prompt taskPrompt is required');
  if (!output.contextSummary?.trim()) issues.push('Prompt contextSummary is required');
  if (!Array.isArray(output.constraints)) issues.push('Prompt constraints must be an array');
  return issues;
}

function validateCoderOutput(output: CoderOutput): string[] {
  if (!output.summary?.trim()) {
    return ['Coder output summary is required'];
  }
  return [];
}

function validateReviewOutput(output: ReviewResult): string[] {
  if (!Array.isArray(output.blockingIssues) || !Array.isArray(output.notes)) {
    return ['Reviewer output must contain issue and notes arrays'];
  }
  return [];
}

function validateTestOutput(output: TestExecutionResult): string[] {
  if (!Array.isArray(output.evidence) || !Array.isArray(output.failures)) {
    return ['Tester output must contain evidence and failures arrays'];
  }
  return [];
}

function validateDocsWriterOutput(output: DocsWriterOutput): string[] {
  if (!output.markdown?.trim()) {
    return ['Documentation output markdown is required'];
  }
  return [];
}
