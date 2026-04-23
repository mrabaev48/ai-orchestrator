import { defaultRoleOutputSchemaRegistry } from '../../core/src/index.ts';

export interface BootstrapAnalysisPrompt {
  id: string;
  role: 'bootstrap_analyst';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export interface BootstrapRepositorySnapshot {
  rootPath: string;
  topLevelEntries: string[];
  packageDirectories: string[];
  packageMap: Record<string, string[]>;
  manifests: string[];
  configFiles: string[];
  entryPoints: string[];
  testInfrastructure: string[];
}

export function buildBootstrapAnalysisPrompt(
  snapshot: BootstrapRepositorySnapshot,
): BootstrapAnalysisPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'bootstrap_analyst',
    systemPrompt: [
      'Establish an initial grounded understanding of the target system.',
      'Describe what exists before proposing what should change.',
      'Avoid speculative redesign and return only structured repository observations.',
    ].join(' '),
    taskPrompt: [
      `Analyze repository root: ${snapshot.rootPath}`,
      `Top-level entries: ${snapshot.topLevelEntries.join(', ') || 'none'}`,
      `Workspace packages: ${snapshot.packageDirectories.join(', ') || 'none'}`,
      `Entry points: ${snapshot.entryPoints.join(', ') || 'none'}`,
      `Test infrastructure: ${snapshot.testInfrastructure.join(', ') || 'none'}`,
    ].join('\n'),
    contextSummary: [
      `manifests=${snapshot.manifests.length}`,
      `configFiles=${snapshot.configFiles.length}`,
      `packages=${snapshot.packageDirectories.length}`,
    ].join(' '),
    outputSchema: defaultRoleOutputSchemaRegistry.getSchema('bootstrap_analyst'),
  };
}
