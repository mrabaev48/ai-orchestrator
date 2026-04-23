import type { BacklogTask } from '../../core/src/backlog.ts';
import type { FailureRecord } from '../../core/src/failures.ts';
import type { AgentRoleName } from '../../core/src/roles.ts';
import { redactSecrets } from '../../shared/src/index.ts';

export interface OptimizedPrompt {
  id: string;
  role: AgentRoleName;
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  constraints: string[];
  outputSchema: Record<string, unknown>;
}

const defaultTemplates: Record<AgentRoleName, string> = {
  bootstrap_analyst: 'Analyze initial project context and summarize concrete findings.',
  architect: 'Assess architecture boundaries, dependencies, and risks.',
  planner: 'Produce an actionable backlog and milestone-aware plan.',
  release_auditor: 'Assess release readiness with explicit blockers, warnings, and evidence.',
  state_steward: 'Assess orchestration state integrity and produce repair guidance.',
  integration_manager: 'Prepare validated external export payloads with explicit traceability.',
  task_manager: 'Select the next best executable task.',
  prompt_engineer: 'Refine prompts for bounded, schema-driven execution.',
  coder: 'Implement only the requested bounded task.',
  reviewer: 'Review the proposed result and surface blocking issues.',
  tester: 'Validate behavior with explicit evidence and missing coverage.',
  docs_writer: 'Update technical documentation with concise diffs.',
};

export class PromptPipeline {
  build(input: {
    role: AgentRoleName;
    task: BacklogTask;
    stateSummary: string;
    failures: FailureRecord[];
    outputSchema: Record<string, unknown>;
  }): OptimizedPrompt {
    const failureConstraints = input.failures.map(
      (failure) => `Avoid repeating failure: ${failure.reason}`,
    );

    return redactSecrets({
      id: crypto.randomUUID(),
      role: input.role,
      systemPrompt: defaultTemplates[input.role],
      taskPrompt: `Task ${input.task.id}: ${input.task.title}`,
      contextSummary: input.stateSummary,
      constraints: [
        ...input.task.acceptanceCriteria.map((criterion) => `Acceptance: ${criterion}`),
        ...failureConstraints,
      ],
      outputSchema: input.outputSchema,
    });
  }
}
