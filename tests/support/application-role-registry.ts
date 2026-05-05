import type { ApplicationRoleRegistry } from '@ai-orchestrator/application';
import type {
  AgentRole,
  AgentRoleName,
  ArchitectureAnalysis,
  ArchitectureFinding,
  Backlog,
  IntegrationExportPayload,
  IntegrationExportRecord,
  Milestone,
  ProjectDiscovery,
  ProjectState,
  ReleaseAssessment,
  RoleExecutionContext,
  RoleRequest,
  RoleResponse,
  StateIntegrityAssessment,
} from '@ai-orchestrator/core';
import type { BootstrapRepositorySnapshot } from '@ai-orchestrator/prompts';

interface ArchitectInput {
  readonly discovery: ProjectState['discovery'];
  readonly sourceImports: Record<string, string[]>;
}

interface PlannerInput {
  readonly discovery: ProjectState['discovery'];
  readonly findings: readonly ArchitectureFinding[];
}

interface PlanningOutput {
  readonly milestone: Milestone;
  readonly backlog: Backlog;
  readonly summary: string;
  readonly dependencyEdges: readonly {
    readonly fromId: string;
    readonly toId: string;
    readonly type: 'contains' | 'depends_on';
    readonly rationale: string;
  }[];
  readonly assumptions: readonly string[];
  readonly risks: readonly {
    readonly id: string;
    readonly title: string;
    readonly severity: 'low' | 'medium' | 'high' | 'critical';
    readonly description: string;
    readonly mitigation: string;
    readonly relatedIds: readonly string[];
  }[];
  readonly mergePreview: {
    readonly batches: readonly {
      readonly id: string;
      readonly taskIds: readonly string[];
      readonly rationale: string;
    }[];
    readonly notes: readonly string[];
  };
}

interface DocsWriterInput {
  readonly projectName: string;
  readonly summary: string;
  readonly affectedModules: readonly string[];
  readonly behaviorChanges: readonly string[];
  readonly designRationale: readonly string[];
  readonly followUpGaps: readonly string[];
}

interface DocumentationOutput {
  readonly summary: string;
  readonly affectedModules: readonly string[];
  readonly behaviorChanges: readonly string[];
  readonly designRationale: readonly string[];
  readonly followUpGaps: readonly string[];
  readonly markdown: string;
}

interface IntegrationManagerInput {
  readonly mappedEntities: readonly IntegrationExportRecord[];
  readonly missingRequiredFields: readonly string[];
  readonly exportBlockers: readonly string[];
}

interface ReleaseAuditorInput {
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly evidence: readonly string[];
}

interface StateStewardInput {
  readonly issues: readonly string[];
}

export function createTestApplicationRoleRegistry(): ApplicationRoleRegistry {
  return new TestApplicationRoleRegistry([
    new TestBootstrapAnalystRole(),
    new TestArchitectRole(),
    new TestPlannerRole(),
    new TestDocsWriterRole(),
    new TestIntegrationManagerRole(),
    new TestReleaseAuditorRole(),
    new TestStateStewardRole(),
  ]);
}

class TestApplicationRoleRegistry implements ApplicationRoleRegistry {
  private readonly roles: ReadonlyMap<AgentRoleName, AgentRole<unknown, unknown>>;

  constructor(roles: readonly AgentRole<unknown, unknown>[]) {
    this.roles = new Map(roles.map((role) => [role.name, role]));
  }

  get<TInput, TOutput>(roleName: AgentRoleName): AgentRole<TInput, TOutput> {
    const role = this.roles.get(roleName);
    if (!role) {
      throw new Error(`Test role is not registered: ${roleName}`);
    }

    return role as AgentRole<TInput, TOutput>;
  }
}

class TestBootstrapAnalystRole implements AgentRole<{ snapshot: BootstrapRepositorySnapshot }, ProjectDiscovery> {
  readonly name = 'bootstrap_analyst' as const;

  execute = async (
    request: RoleRequest<{ snapshot: BootstrapRepositorySnapshot }>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<ProjectDiscovery>> => {
    void context;

    const { snapshot } = request.input;
    const packageInventory = Object.keys(snapshot.packageMap);

    return makeResponse(this.name, 'Created test discovery baseline', {
      generatedAt: '2026-01-01T00:00:00.000Z',
      packageMap: snapshot.packageMap,
      subsystemMap: Object.fromEntries(
        packageInventory.map((packageName) => [packageName, snapshot.packageMap[packageName] ?? []]),
      ),
      packageInventory,
      entryPoints: snapshot.entryPoints,
      testInfrastructure: snapshot.testInfrastructure,
      healthObservations: snapshot.manifests.map((manifest) => `Manifest detected: ${manifest}`),
      unstableAreaCandidates: packageInventory.filter((packageName) => packageName.includes('/execution')),
      criticalPaths: snapshot.entryPoints.length > 0 ? snapshot.entryPoints : packageInventory.slice(0, 3),
      recommendedNextStep: 'architecture_analysis',
    });
  };
}

class TestArchitectRole implements AgentRole<ArchitectInput, ArchitectureAnalysis> {
  readonly name = 'architect' as const;

  execute = async (
    request: RoleRequest<ArchitectInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<ArchitectureAnalysis>> => {
    void context;

    const affectedModule = Object.keys(request.input.sourceImports)[0]
      ?? request.input.discovery.criticalPaths[0]
      ?? 'packages/application/src';

    return makeResponse(this.name, 'Created test architecture findings', {
      findings: [
        {
          subsystem: 'application',
          issueType: 'layering_violation',
          description: 'Test fixture contains a cross-layer source import.',
          impact: 'The fixture demonstrates an architecture risk for the application service.',
          recommendation: 'Route dependencies through public package contracts.',
          affectedModules: [affectedModule],
          severity: 'high',
        },
      ],
      riskSummary: 'Detected 1 architecture finding; prioritize high-severity constraints first.',
    });
  };
}

class TestPlannerRole implements AgentRole<PlannerInput, PlanningOutput> {
  readonly name = 'planner' as const;

  execute = async (
    request: RoleRequest<PlannerInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<PlanningOutput>> => {
    void context;

    const affectedModules = request.input.findings.flatMap((finding) => finding.affectedModules);
    const task = {
      id: 'task-1',
      featureId: 'feature-1',
      title: 'Address architecture finding',
      kind: 'architecture' as const,
      status: 'todo' as const,
      priority: 'p1' as const,
      dependsOn: [],
      acceptanceCriteria: ['Architecture finding is addressed through a bounded change.'],
      affectedModules: affectedModules.length > 0 ? affectedModules : ['packages/application'],
      estimatedRisk: 'medium' as const,
    };
    const backlog: Backlog = {
      epics: {
        'epic-1': {
          id: 'epic-1',
          title: 'Architecture hardening',
          goal: 'Keep application use cases independent from runtime composition.',
          status: 'in_progress',
          featureIds: ['feature-1'],
        },
      },
      features: {
        'feature-1': {
          id: 'feature-1',
          epicId: 'epic-1',
          title: 'Application boundary cleanup',
          outcome: 'Use cases depend on ports and test doubles.',
          risks: ['Boundary drift can return without tests.'],
          taskIds: [task.id],
        },
      },
      tasks: {
        [task.id]: task,
      },
    };

    return makeResponse(this.name, 'Created test backlog plan', {
      milestone: {
        id: 'milestone-1',
        title: 'Boundary hardening',
        goal: 'Close application composition root gaps.',
        status: 'in_progress',
        epicIds: ['epic-1'],
        entryCriteria: ['Architecture analysis completed.'],
        exitCriteria: ['Application tests use ports.'],
      },
      backlog,
      summary: 'Created a bounded architecture hardening plan.',
      dependencyEdges: [
        {
          fromId: 'epic-1',
          toId: 'feature-1',
          type: 'contains',
          rationale: 'The feature implements the epic goal.',
        },
      ],
      assumptions: ['The runtime package remains the outer composition root.'],
      risks: [
        {
          id: 'risk-1',
          title: 'Boundary drift',
          severity: 'medium',
          description: 'Tests can accidentally depend on production composition.',
          mitigation: 'Use test doubles for application role ports.',
          relatedIds: [task.id],
        },
      ],
      mergePreview: {
        batches: [
          {
            id: 'batch-1',
            taskIds: [task.id],
            rationale: 'Single bounded application boundary change.',
          },
        ],
        notes: ['Keep runtime composition tested separately.'],
      },
    });
  };
}

class TestDocsWriterRole implements AgentRole<DocsWriterInput, DocumentationOutput> {
  readonly name = 'docs_writer' as const;

  execute = async (
    request: RoleRequest<DocsWriterInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<DocumentationOutput>> => {
    void context;

    const markdown = [
      '# Project update summary',
      '',
      `Project: ${request.input.projectName}`,
      '',
      request.input.summary,
    ].join('\n');

    return makeResponse(this.name, 'Created test documentation output', {
      summary: request.input.summary,
      affectedModules: [...request.input.affectedModules],
      behaviorChanges: [...request.input.behaviorChanges],
      designRationale: [...request.input.designRationale],
      followUpGaps: [...request.input.followUpGaps],
      markdown,
    });
  };
}

class TestIntegrationManagerRole implements AgentRole<IntegrationManagerInput, IntegrationExportPayload> {
  readonly name = 'integration_manager' as const;

  execute = async (
    request: RoleRequest<IntegrationManagerInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<IntegrationExportPayload>> => {
    void context;

    return makeResponse(this.name, 'Created test integration export payload', {
      integrationTarget: 'generic_json',
      mappedEntities: [...request.input.mappedEntities],
      missingRequiredFields: [...request.input.missingRequiredFields],
      exportBlockers: [...request.input.exportBlockers],
      recommendedFixes: request.input.exportBlockers.map((blocker) => `Resolve ${blocker}`),
    });
  };
}

class TestReleaseAuditorRole implements AgentRole<ReleaseAuditorInput, ReleaseAssessment> {
  readonly name = 'release_auditor' as const;

  execute = async (
    request: RoleRequest<ReleaseAuditorInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<ReleaseAssessment>> => {
    void context;

    const verdict = request.input.blockers.length > 0
      ? 'blocked'
      : request.input.warnings.length > 0
        ? 'caution'
        : 'ready';

    return makeResponse(this.name, 'Created test release assessment', {
      verdict,
      confidence: verdict === 'ready' ? 0.9 : 0.7,
      blockers: [...request.input.blockers],
      warnings: [...request.input.warnings],
      evidence: [...request.input.evidence],
      recommendedNextActions: verdict === 'ready' ? ['Proceed with release review.'] : ['Resolve findings.'],
    });
  };
}

class TestStateStewardRole implements AgentRole<StateStewardInput, StateIntegrityAssessment> {
  readonly name = 'state_steward' as const;

  execute = async (
    request: RoleRequest<StateStewardInput>,
    context: RoleExecutionContext,
  ): Promise<RoleResponse<StateIntegrityAssessment>> => {
    void context;

    return makeResponse(this.name, 'Created test state integrity assessment', {
      ok: request.input.issues.length === 0,
      findings: request.input.issues.map((issue) => ({
        issue,
        severity: 'high',
        repairRecommendation: 'Repair the invalid state transition before continuing.',
        safeToAutoRepair: false,
      })),
      summary: request.input.issues.length === 0
        ? 'State is valid.'
        : `Detected ${request.input.issues.length} state integrity issue(s).`,
    });
  };
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
    confidence: 0.9,
  };
}
