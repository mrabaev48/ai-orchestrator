import { defaultExecutionPolicyEngine,
  makeEvent,
  validateProjectState,
  type StateIntegrityAssessment,
} from '../../core/src/index.ts';
import { buildStateIntegrityPrompt } from '../../prompts/src/index.ts';
import type { RoleRegistry } from '../../agents/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';
import { assertRoleOutput } from './role-output-validation.ts';

export class StateIntegrityService {
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

  async inspect(): Promise<StateIntegrityAssessment> {
    const state = await this.stateStore.load();
    const validation = validateProjectState(state);
    const prompt = buildStateIntegrityPrompt({
      issueCount: validation.issues.length,
      issues: validation.issues,
    });
    const stateSteward = this.roleRegistry.get<{ issues: string[] }, StateIntegrityAssessment>(
      'state_steward',
    );
    const response = await stateSteward.execute(
      makeStateStewardRequest(validation.issues, prompt.outputSchema),
      defaultExecutionPolicyEngine.resolve({
        runId: crypto.randomUUID(),
        role: 'state_steward',
        stateSummary: state.summary,
        workspaceRoot: process.cwd(),
        allowedWritePaths: [],
        evidenceSource: 'state_snapshot',
        logger: this.logger,
      }),
    );
    await stateSteward.validate?.(response);
    assertRoleOutput('state_steward', response);

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'state_integrity_report',
      title: 'State integrity report',
      metadata: {
        ok: String(response.output.ok),
        findings: String(response.output.findings.length),
        promptId: prompt.id,
      },
      createdAt: new Date().toISOString(),
    });
    await this.stateStore.recordEvent(
      makeEvent('STATE_INTEGRITY_CHECKED', {
        ok: response.output.ok,
        findings: response.output.findings.length,
      }),
    );

    this.logger.info('State integrity checked', {
      event: 'state_integrity_checked',
      result: response.output.ok ? 'ok' : 'fail',
      data: {
        findings: response.output.findings.length,
      },
    });

    return response.output;
  }
}

function makeStateStewardRequest(
  issues: string[],
  outputSchema: Record<string, unknown>,
): RoleRequest<{ issues: string[] }> {
  return {
    role: 'state_steward',
    objective: 'Assess state integrity and produce repair guidance',
    input: { issues },
    acceptanceCriteria: [
      'Return explainable findings for state corruption or inconsistency',
      'Preserve auditability and avoid silent mutation',
    ],
    expectedOutputSchema: outputSchema,
  };
}
