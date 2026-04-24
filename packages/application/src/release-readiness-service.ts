import { buildReleaseAssessmentPrompt } from '../../prompts/src/index.ts';
import { makeEvent, type ReleaseAssessment } from '../../core/src/index.ts';
import type { RoleRegistry } from '../../agents/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';
import { assertRoleOutput } from './role-output-validation.ts';

export class ReleaseReadinessService {
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

  async assess(): Promise<ReleaseAssessment> {
    const state = await this.stateStore.load();
    const blockers = collectBlockers(state);
    const warnings = collectWarnings(state);
    const evidence = collectEvidence(state);
    const prompt = buildReleaseAssessmentPrompt({ blockers, warnings, evidence });
    const releaseAuditor = this.roleRegistry.get<
      { blockers: string[]; warnings: string[]; evidence: string[] },
      ReleaseAssessment
    >('release_auditor');
    const response = await releaseAuditor.execute(
      makeReleaseRequest(blockers, warnings, evidence, prompt.outputSchema),
      {
        runId: crypto.randomUUID(),
        role: 'release_auditor',
        stateSummary: state.summary,
        toolProfile: {
          allowedWritePaths: [],
          canWriteRepo: false,
          canApproveChanges: false,
          canRunTests: false,
        },
        toolExecution: {
          policy: 'quality_gate',
          permissionScope: 'read_only',
          workspaceRoot: process.cwd(),
          evidenceSource: 'artifacts',
        },
        logger: this.logger.withContext({ role: 'release_auditor' }),
      },
    );
    await releaseAuditor.validate?.(response);
    assertRoleOutput('release_auditor', response);

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'release_assessment',
      title: 'Release readiness assessment',
      metadata: {
        verdict: response.output.verdict,
        confidence: String(response.output.confidence),
        promptId: prompt.id,
      },
      createdAt: new Date().toISOString(),
    });
    await this.stateStore.recordEvent(
      makeEvent('RELEASE_ASSESSED', {
        verdict: response.output.verdict,
        confidence: response.output.confidence,
      }),
    );

    this.logger.info('Release readiness assessed', {
      event: 'release_assessed',
      result: 'ok',
      data: {
        verdict: response.output.verdict,
      },
    });

    return response.output;
  }
}

function makeReleaseRequest(
  blockers: string[],
  warnings: string[],
  evidence: string[],
  outputSchema: Record<string, unknown>,
): RoleRequest<{ blockers: string[]; warnings: string[]; evidence: string[] }> {
  return {
    role: 'release_auditor',
    objective: 'Assess release readiness',
    input: { blockers, warnings, evidence },
    acceptanceCriteria: [
      'Distinguish explicit release blockers from warnings',
      'Ground the assessment in available evidence',
    ],
    expectedOutputSchema: outputSchema,
  };
}

function collectBlockers(
  state: Awaited<ReturnType<StateStore['load']>>,
): string[] {
  const blockers: string[] = [];

  if (state.repoHealth.tests === 'failing') {
    blockers.push('Repository tests are failing');
  }

  if (state.repoHealth.typecheck === 'failing') {
    blockers.push('Repository typecheck is failing');
  }

  if (state.execution.blockedTaskIds.length > 0) {
    blockers.push(`Blocked tasks remain: ${state.execution.blockedTaskIds.join(', ')}`);
  }

  return blockers;
}

function collectWarnings(
  state: Awaited<ReturnType<StateStore['load']>>,
): string[] {
  const warnings: string[] = [];

  if (state.repoHealth.tests === 'unknown') {
    warnings.push('Test status is unknown');
  }

  if (state.repoHealth.build === 'unknown') {
    warnings.push('Build status is unknown');
  }

  if (!state.artifacts.some((artifact) => artifact.type === 'documentation')) {
    warnings.push('Documentation artifact is missing');
  }

  if (state.failures.length > 0) {
    warnings.push(`Historical failures recorded: ${state.failures.length}`);
  }

  return warnings;
}

function collectEvidence(
  state: Awaited<ReturnType<StateStore['load']>>,
): string[] {
  const evidence = [
    `Repo health: build=${state.repoHealth.build} tests=${state.repoHealth.tests} lint=${state.repoHealth.lint} typecheck=${state.repoHealth.typecheck}`,
    `Artifacts recorded: ${state.artifacts.length}`,
    `Decisions recorded: ${state.decisions.length}`,
  ];

  if (state.currentMilestoneId) {
    evidence.push(`Active milestone: ${state.currentMilestoneId}`);
  }

  return evidence;
}
