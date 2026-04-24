import type { RoleRegistry } from '../../agents/src/index.ts';
import {
  assertProjectState,
  makeEvent,
  type ArchitectureFinding,
  type Backlog,
  type Milestone,
  type ProjectState,
} from '../../core/src/index.ts';
import { buildPlanningPrompt } from '../../prompts/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';
import { assertRoleOutput } from './role-output-validation.ts';

interface PlanningOutput {
  milestone: Milestone;
  backlog: Backlog;
  summary: string;
}

export class PlanningService {
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly logger: Logger;

  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    logger: Logger,
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.logger = logger;
  }

  async plan(state?: ProjectState): Promise<PlanningOutput> {
    const currentState = state ?? await this.stateStore.load();
    const prompt = buildPlanningPrompt(
      currentState.discovery,
      currentState.architecture.findings,
    );
    const planner = this.roleRegistry.get<
      { discovery: ProjectState['discovery']; findings: ArchitectureFinding[] },
      PlanningOutput
    >('planner');
    const response = await planner.execute(
      makePlannerRoleRequest(currentState, prompt.outputSchema),
      {
        runId: crypto.randomUUID(),
        role: 'planner',
        stateSummary: currentState.summary,
        toolProfile: {
          allowedWritePaths: [],
          canWriteRepo: false,
          canApproveChanges: false,
          canRunTests: false,
        },
        toolExecution: {
          policy: 'read_only_analysis',
          permissionScope: 'read_only',
          workspaceRoot: process.cwd(),
          evidenceSource: 'state_snapshot',
        },
        logger: this.logger.withContext({ role: 'planner' }),
      },
    );
    await planner.validate?.(response);
    assertRoleOutput('planner', response);

    currentState.backlog = response.output.backlog;
    currentState.milestones[response.output.milestone.id] = response.output.milestone;
    currentState.currentMilestoneId = response.output.milestone.id;
    assertProjectState(currentState);
    await this.stateStore.save(currentState);

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'plan',
      title: 'Backlog plan',
      metadata: {
        promptId: prompt.id,
        tasks: String(Object.keys(response.output.backlog.tasks).length),
        milestoneId: response.output.milestone.id,
      },
      createdAt: new Date().toISOString(),
    });
    await this.stateStore.recordEvent(
      makeEvent('BACKLOG_PLANNED', {
        taskCount: Object.keys(response.output.backlog.tasks).length,
        milestoneId: response.output.milestone.id,
      }),
    );

    this.logger.info('Backlog plan created', {
      event: 'backlog_planned',
      result: 'ok',
      data: {
        milestoneId: response.output.milestone.id,
        taskCount: Object.keys(response.output.backlog.tasks).length,
      },
    });

    return response.output;
  }
}

function makePlannerRoleRequest(
  state: ProjectState,
  outputSchema: Record<string, unknown>,
): RoleRequest<{
  discovery: ProjectState['discovery'];
  findings: ArchitectureFinding[];
}> {
  return {
    role: 'planner',
    objective: 'Produce milestone-aware backlog updates',
    input: {
      discovery: state.discovery,
      findings: state.architecture.findings,
    },
    acceptanceCriteria: [
      'Return milestone-aware backlog output',
      'Preserve acceptance criteria and dependency-aware task sequencing',
    ],
    expectedOutputSchema: outputSchema,
  };
}
