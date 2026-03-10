import type { BacklogTask } from '../../core/src/backlog.ts';
import type { FailureRecord } from '../../core/src/failures.ts';
import type { ReviewResult } from '../../core/src/review.ts';
import type {
  AgentRole,
  AgentRoleName,
  RoleRequest,
  RoleResponse,
} from '../../core/src/roles.ts';
import type { TestExecutionResult } from '../../core/src/testing.ts';
import type { ProjectState } from '../../core/src/project-state.ts';
import type { OptimizedPrompt } from '../../prompts/src/index.ts';
import { PromptPipeline } from '../../prompts/src/index.ts';
import { selectNextTask } from '../../workflow/src/index.ts';

interface PromptEngineerInput {
  task: BacklogTask;
  stateSummary: string;
  failures: FailureRecord[];
  outputSchema: Record<string, unknown>;
}

interface CodeExecutionOutput {
  changed: boolean;
  summary: string;
}

function makeResponse<TOutput>(
  role: AgentRoleName,
  summary: string,
  output: TOutput,
): RoleResponse<TOutput> {
  return {
    role,
    summary,
    output,
    warnings: [],
    risks: [],
    needsHumanDecision: false,
    confidence: 0.8,
  };
}

export class TaskManagerRole implements AgentRole<{ state: ProjectState }, BacklogTask | null> {
  readonly name = 'task_manager' as const;

  execute = async (
    request: RoleRequest<{ state: ProjectState }>,
  ): Promise<RoleResponse<BacklogTask | null>> => {
    const task = selectNextTask(request.input.state) ?? null;
    return makeResponse(this.name, task ? `Selected ${task.id}` : 'No executable task', task);
  };
}

export class PromptEngineerRole implements AgentRole<PromptEngineerInput, OptimizedPrompt> {
  readonly name = 'prompt_engineer' as const;
  private readonly pipeline = new PromptPipeline();

  execute = async (
    request: RoleRequest<PromptEngineerInput>,
  ): Promise<RoleResponse<OptimizedPrompt>> => {
    const prompt = this.pipeline.build({
      role: 'coder',
      task: request.input.task,
      stateSummary: request.input.stateSummary,
      failures: request.input.failures,
      outputSchema: request.input.outputSchema,
    });

    return makeResponse(this.name, `Generated prompt for ${request.input.task.id}`, prompt);
  };
}

export class CoderRole implements AgentRole<{ task: BacklogTask; prompt: OptimizedPrompt }, CodeExecutionOutput> {
  readonly name = 'coder' as const;

  execute = async (
    request: RoleRequest<{ task: BacklogTask; prompt: OptimizedPrompt }>,
  ): Promise<RoleResponse<CodeExecutionOutput>> => {
    return makeResponse(this.name, `Executed task ${request.input.task.id}`, {
      changed: true,
      summary: `Stub execution completed for ${request.input.task.title}`,
    });
  };
}

export class ReviewerRole implements AgentRole<{ task: BacklogTask; result: CodeExecutionOutput }, ReviewResult> {
  readonly name = 'reviewer' as const;

  execute = async (
    request: RoleRequest<{ task: BacklogTask; result: CodeExecutionOutput }>,
  ): Promise<RoleResponse<ReviewResult>> => {
    const isBlocked = request.input.task.acceptanceCriteria.some((criterion) =>
      criterion.toLowerCase().includes('[reject]'),
    );

    return makeResponse(this.name, `Reviewed ${request.input.task.id}`, {
      approved: !isBlocked,
      blockingIssues: isBlocked ? ['Forced reviewer rejection'] : [],
      nonBlockingSuggestions: [],
      missingTests: [],
      notes: [],
    });
  };
}

export class TesterRole implements AgentRole<{ task: BacklogTask; result: CodeExecutionOutput }, TestExecutionResult> {
  readonly name = 'tester' as const;

  execute = async (
    request: RoleRequest<{ task: BacklogTask; result: CodeExecutionOutput }>,
  ): Promise<RoleResponse<TestExecutionResult>> => {
    const isFailed = request.input.task.acceptanceCriteria.some((criterion) =>
      criterion.toLowerCase().includes('[fail-test]'),
    );

    return makeResponse(this.name, `Tested ${request.input.task.id}`, {
      passed: !isFailed,
      testPlan: [`Validate ${request.input.task.title}`],
      evidence: isFailed ? [] : ['Synthetic runtime test passed'],
      failures: isFailed ? ['Forced tester failure'] : [],
      missingCoverage: [],
    });
  };
}
