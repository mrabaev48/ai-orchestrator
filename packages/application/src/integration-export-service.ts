import path from 'node:path';

import {
  makeEvent,
  type IntegrationExportPayload,
  type IntegrationExportRecord,
  type ProjectState,
} from '../../core/src/index.ts';
import { buildIntegrationExportPrompt } from '../../prompts/src/index.ts';
import type { RoleRegistry } from '../../agents/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import { createLocalToolSet } from '../../tools/src/index.ts';
import type { RuntimeConfig } from '../../shared/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';

export class IntegrationExportService {
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly logger: Logger;
  private readonly toolSet: ReturnType<typeof createLocalToolSet>;

  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    config: RuntimeConfig,
    logger: Logger,
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.logger = logger;
    this.toolSet = createLocalToolSet(config.tools.allowedWritePaths);
  }

  async prepare(out?: string): Promise<string> {
    const state = await this.stateStore.load();
    const mappedEntities = mapExportEntities(state);
    const missingRequiredFields = collectMissingRequiredFields(state);
    const exportBlockers = collectExportBlockers(state);
    const prompt = buildIntegrationExportPrompt({
      taskCount: Object.keys(state.backlog.tasks).length,
      artifactCount: state.artifacts.length,
      blockedTaskCount: state.execution.blockedTaskIds.length,
    });
    const integrationManager = this.roleRegistry.get<
      {
        mappedEntities: IntegrationExportRecord[];
        missingRequiredFields: string[];
        exportBlockers: string[];
      },
      IntegrationExportPayload
    >('integration_manager');
    const response = await integrationManager.execute(
      makeIntegrationRequest(mappedEntities, missingRequiredFields, exportBlockers, prompt.outputSchema),
      {
        runId: crypto.randomUUID(),
        role: 'integration_manager',
        stateSummary: state.summary,
        toolProfile: {
          allowedWritePaths: [],
          canWriteRepo: false,
          canApproveChanges: false,
          canRunTests: false,
        },
        logger: this.logger.withContext({ role: 'integration_manager' }),
      },
    );
    await integrationManager.validate?.(response);

    const outputPath = path.resolve(process.cwd(), out ?? 'artifacts/integration-export.json');
    await this.toolSet.fileSystem.writeFile(outputPath, JSON.stringify(response.output, null, 2));
    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'integration_export',
      title: 'Integration export payload',
      location: outputPath,
      metadata: {
        mappedEntities: String(response.output.mappedEntities.length),
        blockers: String(response.output.exportBlockers.length),
        promptId: prompt.id,
      },
      createdAt: new Date().toISOString(),
    });
    await this.stateStore.recordEvent(
      makeEvent('EXPORT_PREPARED', {
        mappedEntities: response.output.mappedEntities.length,
        blockers: response.output.exportBlockers.length,
      }),
    );

    this.logger.info('Integration export prepared', {
      event: 'integration_export_prepared',
      result: 'ok',
      data: {
        outputPath,
      },
    });

    return outputPath;
  }
}

function makeIntegrationRequest(
  mappedEntities: IntegrationExportRecord[],
  missingRequiredFields: string[],
  exportBlockers: string[],
  outputSchema: Record<string, unknown>,
): RoleRequest<{
  mappedEntities: IntegrationExportRecord[];
  missingRequiredFields: string[];
  exportBlockers: string[];
}> {
  return {
    role: 'integration_manager',
    objective: 'Prepare export-ready payloads',
    input: { mappedEntities, missingRequiredFields, exportBlockers },
    acceptanceCriteria: [
      'Preserve traceability to internal entities',
      'Surface missing fields and export blockers explicitly',
    ],
    expectedOutputSchema: outputSchema,
  };
}

function mapExportEntities(state: ProjectState): IntegrationExportRecord[] {
  const mappedTasks = Object.values(state.backlog.tasks).map((task) => ({
    entityType: 'task' as const,
    internalId: task.id,
    title: task.title,
    status: task.status,
    dependencies: [...task.dependsOn],
    acceptanceCriteria: [...task.acceptanceCriteria],
    affectedModules: [...task.affectedModules],
    traceability: {
      featureId: task.featureId,
      ...(task.splitFromTaskId ? { splitFromTaskId: task.splitFromTaskId } : {}),
    },
  }));

  const mappedArtifacts = state.artifacts.map((artifact) => ({
    entityType: 'artifact' as const,
    internalId: artifact.id,
    title: artifact.title,
    status: artifact.type,
    dependencies: [],
    acceptanceCriteria: [],
    affectedModules: [],
    traceability: {
      artifactType: artifact.type,
      ...(artifact.location ? { location: artifact.location } : {}),
    },
  }));

  return [...mappedTasks, ...mappedArtifacts];
}

function collectMissingRequiredFields(state: ProjectState): string[] {
  const missing: string[] = [];

  for (const task of Object.values(state.backlog.tasks)) {
    if (task.acceptanceCriteria.length === 0) {
      missing.push(`task:${task.id}:acceptanceCriteria`);
    }
  }

  return missing;
}

function collectExportBlockers(state: ProjectState): string[] {
  const blockers: string[] = [];

  if (state.execution.blockedTaskIds.length > 0) {
    blockers.push(`Blocked tasks present: ${state.execution.blockedTaskIds.join(', ')}`);
  }

  if (state.currentMilestoneId == null) {
    blockers.push('Active milestone is missing');
  }

  return blockers;
}
