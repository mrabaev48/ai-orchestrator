import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { RoleRegistry } from '../../agents/src/index.ts';
import {
  assertProjectState,
  makeEvent,
  type ProjectDiscovery,
  type ProjectState,
} from '../../core/src/index.ts';
import {
  buildBootstrapAnalysisPrompt,
  type BootstrapRepositorySnapshot,
} from '../../prompts/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';
import { assertRoleOutput } from './role-output-validation.ts';

export class BootstrapService {
  private readonly stateStore: StateStore;
  private readonly roleRegistry: RoleRegistry;
  private readonly logger: Logger;
  private readonly rootPath: string;

  constructor(
    stateStore: StateStore,
    roleRegistry: RoleRegistry,
    logger: Logger,
    rootPath: string = process.cwd(),
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.logger = logger;
    this.rootPath = rootPath;
  }

  async bootstrap(state: ProjectState, snapshotOnBootstrap: boolean): Promise<void> {
    const snapshot = collectBootstrapRepositorySnapshot(this.rootPath);
    const prompt = buildBootstrapAnalysisPrompt(snapshot);
    const bootstrapAnalyst = this.roleRegistry.get<
      { snapshot: BootstrapRepositorySnapshot },
      ProjectDiscovery
    >('bootstrap_analyst');
    const response = await bootstrapAnalyst.execute(
      makeBootstrapRoleRequest(snapshot, prompt.outputSchema),
      {
        runId: crypto.randomUUID(),
        role: 'bootstrap_analyst',
        stateSummary: state.summary,
        toolProfile: {
          allowedWritePaths: [this.rootPath],
          canWriteRepo: false,
          canApproveChanges: false,
          canRunTests: false,
        },
        toolExecution: {
          policy: 'read_only_analysis',
          permissionScope: 'read_only',
          workspaceRoot: this.rootPath,
          evidenceSource: 'state_snapshot',
        },
        logger: this.logger.withContext({ role: 'bootstrap_analyst' }),
      },
    );
    await bootstrapAnalyst.validate?.(response);
    assertRoleOutput('bootstrap_analyst', response);

    state.discovery = response.output;
    state.architecture.packageMap = response.output.packageMap;
    state.architecture.subsystemMap = response.output.subsystemMap;
    state.architecture.unstableAreas = [...response.output.unstableAreaCandidates];
    state.architecture.criticalPaths = [...response.output.criticalPaths];
    assertProjectState(state);

    if (snapshotOnBootstrap) {
      await this.stateStore.save(state);
    }

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'bootstrap_analysis',
      title: 'Bootstrap analysis',
      metadata: {
        promptId: prompt.id,
        recommendedNextStep: response.output.recommendedNextStep,
        packageCount: String(response.output.packageInventory.length),
      },
      createdAt: new Date().toISOString(),
    });
    await this.stateStore.recordEvent(
      makeEvent('DISCOVERY_COMPLETED', {
        packageCount: response.output.packageInventory.length,
        recommendedNextStep: response.output.recommendedNextStep,
      }),
    );
    await this.stateStore.recordEvent(
      makeEvent('BOOTSTRAP_COMPLETED', {
        projectId: state.projectId,
        projectName: state.projectName,
      }),
    );

    this.logger.info('Bootstrap discovery completed', {
      event: 'bootstrap_completed',
      result: 'ok',
      data: {
        packageCount: response.output.packageInventory.length,
        recommendedNextStep: response.output.recommendedNextStep,
      },
    });
  }
}

function makeBootstrapRoleRequest(
  snapshot: BootstrapRepositorySnapshot,
  outputSchema: Record<string, unknown>,
): RoleRequest<{ snapshot: BootstrapRepositorySnapshot }> {
  return {
    role: 'bootstrap_analyst',
    objective: 'Establish initial repository understanding',
    input: { snapshot },
    acceptanceCriteria: [
      'Describe repository structure without proposing changes',
      'Return reusable discovery context for Architect and Planner',
    ],
    expectedOutputSchema: outputSchema,
  };
}

export function collectBootstrapRepositorySnapshot(
  rootPath: string,
): BootstrapRepositorySnapshot {
  const topLevelEntries = readdirSafe(rootPath);
  const packageDirectories = [
    ...collectWorkspaceDirectories(rootPath, 'apps'),
    ...collectWorkspaceDirectories(rootPath, 'packages'),
  ];
  const packageMap = Object.fromEntries(
    packageDirectories.map((directory) => [
      directory,
      readdirSafe(path.resolve(rootPath, directory)).filter((entry) =>
        isDirectory(path.resolve(rootPath, directory, entry)),
      ),
    ]),
  );

  return {
    rootPath,
    topLevelEntries,
    packageDirectories,
    packageMap,
    manifests: topLevelEntries.filter((entry) =>
      entry === 'package.json' || entry.endsWith('.json'),
    ),
    configFiles: topLevelEntries.filter((entry) =>
      entry.startsWith('tsconfig') || entry.startsWith('eslint') || entry.endsWith('.config.mjs'),
    ),
    entryPoints: packageDirectories
      .filter((directory) => hasChildDirectory(rootPath, directory, 'src'))
      .map((directory) => `${directory}/src`),
    testInfrastructure: topLevelEntries.filter((entry) =>
      entry === 'tests' || entry.includes('test'),
    ),
  };
}

function collectWorkspaceDirectories(rootPath: string, segment: string): string[] {
  const segmentPath = path.resolve(rootPath, segment);
  if (!isDirectory(segmentPath)) {
    return [];
  }

  return readdirSafe(segmentPath)
    .filter((entry) => isDirectory(path.resolve(segmentPath, entry)))
    .map((entry) => `${segment}/${entry}`);
}

function hasChildDirectory(rootPath: string, parent: string, child: string): boolean {
  return isDirectory(path.resolve(rootPath, parent, child));
}

function readdirSafe(targetPath: string): string[] {
  try {
    return readdirSync(targetPath).sort();
  } catch {
    return [];
  }
}

function isDirectory(targetPath: string): boolean {
  try {
    return statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}
