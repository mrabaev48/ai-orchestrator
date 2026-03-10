import type { BacklogTask } from '../../core/src/backlog.ts';
import type {
  ArchitectureAnalysis,
  ArchitectureFinding,
} from '../../core/src/architecture-findings.ts';
import type { FailureRecord } from '../../core/src/failures.ts';
import type { ProjectDiscovery } from '../../core/src/discovery.ts';
import type { ReviewResult } from '../../core/src/review.ts';
import type {
  AgentRole,
  AgentRoleName,
  RoleExecutionContext,
  RoleRequest,
  RoleResponse,
} from '../../core/src/roles.ts';
import type { TestExecutionResult } from '../../core/src/testing.ts';
import type { ProjectState } from '../../core/src/project-state.ts';
import type { OptimizedPrompt } from '../../prompts/src/index.ts';
import { PromptPipeline } from '../../prompts/src/index.ts';
import { selectNextTask } from '../../workflow/src/index.ts';

interface BootstrapRepositorySnapshot {
  rootPath: string;
  topLevelEntries: string[];
  packageDirectories: string[];
  packageMap: Record<string, string[]>;
  manifests: string[];
  configFiles: string[];
  entryPoints: string[];
  testInfrastructure: string[];
}

interface ArchitectInput {
  discovery: ProjectDiscovery;
  sourceImports: Record<string, string[]>;
}

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

export class BootstrapAnalystRole implements AgentRole<
  { snapshot: BootstrapRepositorySnapshot },
  ProjectDiscovery
> {
  readonly name = 'bootstrap_analyst' as const;

  execute = async (
    request: RoleRequest<{ snapshot: BootstrapRepositorySnapshot }>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<ProjectDiscovery>> => {
    void context;

    const { snapshot } = request.input;
    const subsystemMap = buildSubsystemMap(snapshot);
    const packageInventory = Object.keys(snapshot.packageMap);
    const healthObservations = buildHealthObservations(snapshot);
    const unstableAreaCandidates = packageInventory.filter((entry) =>
      entry.includes('/execution') || entry.includes('/workflow') || entry.includes('/state'),
    );
    const criticalPaths = snapshot.entryPoints.length > 0
      ? snapshot.entryPoints
      : snapshot.packageDirectories.slice(0, 3);

    return makeResponse(this.name, `Established bootstrap baseline for ${snapshot.rootPath}`, {
      generatedAt: new Date().toISOString(),
      packageMap: snapshot.packageMap,
      subsystemMap,
      packageInventory,
      entryPoints: snapshot.entryPoints,
      testInfrastructure: snapshot.testInfrastructure,
      healthObservations,
      unstableAreaCandidates,
      criticalPaths,
      recommendedNextStep: 'architecture_analysis',
    });
  };

  validate = (response: RoleResponse<ProjectDiscovery>): void => {
    if (response.output.recommendedNextStep !== 'architecture_analysis') {
      throw new Error('Bootstrap analysis must hand off to architecture analysis');
    }
  };
}

export class ArchitectRole implements AgentRole<ArchitectInput, ArchitectureAnalysis> {
  readonly name = 'architect' as const;

  execute = async (
    request: RoleRequest<ArchitectInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<ArchitectureAnalysis>> => {
    void context;

    const findings: ArchitectureFinding[] = [];
    findings.push(...findDirectSourceImportFindings(request.input.sourceImports));

    if (request.input.discovery.criticalPaths.length >= 2) {
      findings.push({
        subsystem: 'runtime',
        issueType: 'critical_path_gap',
        description: `Critical execution path spans ${request.input.discovery.criticalPaths.length} structural entry points`,
        impact: 'Coordinated runtime changes are more likely to cross package boundaries and regress without explicit contracts.',
        recommendation: 'Preserve stable service and port boundaries around critical runtime packages before adding richer orchestration flows.',
        affectedModules: [...request.input.discovery.criticalPaths],
        severity: 'medium',
      });
    }

    const riskSummary = findings.length === 0
      ? 'No material architecture findings detected from the current discovery baseline.'
      : `Detected ${findings.length} architecture finding(s); prioritize ${highestSeverity(findings)}-severity constraints first.`;

    return makeResponse(this.name, 'Produced structured architecture findings', {
      findings,
      riskSummary,
    });
  };

  validate = (response: RoleResponse<ArchitectureAnalysis>): void => {
    if (!response.output.riskSummary.trim()) {
      throw new Error('Architecture analysis must include a risk summary');
    }

    for (const finding of response.output.findings) {
      if (finding.affectedModules.length === 0) {
        throw new Error('Architecture findings must include affected modules');
      }
    }
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

function buildSubsystemMap(
  snapshot: BootstrapRepositorySnapshot,
): Record<string, string[]> {
  const subsystemMap: Record<string, string[]> = {};

  for (const packageDirectory of snapshot.packageDirectories) {
    const [segment, name] = packageDirectory.split('/');
    if (!segment || !name) {
      continue;
    }

    const group = segment === 'apps' ? 'applications' : 'packages';
    subsystemMap[group] ??= [];
    subsystemMap[group].push(packageDirectory);

    if (name.includes('control-plane')) {
      subsystemMap.cli ??= [];
      subsystemMap.cli.push(packageDirectory);
    }
  }

  if (snapshot.testInfrastructure.length > 0) {
    subsystemMap.testing = [...snapshot.testInfrastructure];
  }

  return subsystemMap;
}

function buildHealthObservations(snapshot: BootstrapRepositorySnapshot): string[] {
  const observations: string[] = [];

  if (snapshot.manifests.includes('package.json')) {
    observations.push('package.json manifest detected');
  }

  if (snapshot.configFiles.includes('eslint.config.mjs')) {
    observations.push('ESLint configuration detected');
  }

  if (snapshot.configFiles.includes('tsconfig.json')) {
    observations.push('TypeScript configuration detected');
  }

  if (snapshot.testInfrastructure.length > 0) {
    observations.push(`Test infrastructure present in ${snapshot.testInfrastructure.join(', ')}`);
  }

  return observations;
}

function findDirectSourceImportFindings(
  sourceImports: Record<string, string[]>,
): ArchitectureFinding[] {
  const offenders = Object.entries(sourceImports)
    .filter(([, imports]) => imports.some((entry) => /packages\/.+\/src\//.test(entry)));

  if (offenders.length === 0) {
    return [];
  }

  return [
    {
      subsystem: 'module_boundaries',
      issueType: 'contract_instability',
      description: 'Application entrypoints import package source paths directly instead of a stable package boundary.',
      impact: 'Internal source path coupling increases refactor cost and makes package contracts easier to break accidentally.',
      recommendation: 'Expose package-level entrypoints and prefer importing through stable public module boundaries.',
      affectedModules: offenders.map(([filePath]) => filePath),
      severity: 'medium',
    },
  ];
}

function highestSeverity(findings: ArchitectureFinding[]): ArchitectureFinding['severity'] {
  const severityWeight: Record<ArchitectureFinding['severity'], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return [...findings]
    .sort((left, right) => severityWeight[right.severity] - severityWeight[left.severity])[0]
    ?.severity ?? 'low';
}
