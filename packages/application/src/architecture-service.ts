import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import type { RoleRegistry } from '../../agents/src/index.ts';
import {
  assertProjectState,
  makeEvent,
  type ArchitectureAnalysis,
  type ProjectState,
} from '../../core/src/index.ts';
import { buildArchitectureAnalysisPrompt } from '../../prompts/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import type { RoleRequest } from '../../core/src/roles.ts';
import { assertRoleOutput } from './role-output-validation.ts';

export class ArchitectureService {
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

  async analyze(state?: ProjectState): Promise<ArchitectureAnalysis> {
    const currentState = state ?? await this.stateStore.load();
    const sourceImports = collectSourceImports(this.rootPath);
    const prompt = buildArchitectureAnalysisPrompt(
      currentState.discovery,
      Object.keys(sourceImports).length,
    );
    const architect = this.roleRegistry.get<
      { discovery: ProjectState['discovery']; sourceImports: Record<string, string[]> },
      ArchitectureAnalysis
    >('architect');
    const response = await architect.execute(
      makeArchitectRoleRequest(currentState, sourceImports, prompt.outputSchema),
      {
        runId: crypto.randomUUID(),
        role: 'architect',
        stateSummary: currentState.summary,
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
        logger: this.logger.withContext({ role: 'architect' }),
      },
    );
    await architect.validate?.(response);
    assertRoleOutput('architect', response);

    currentState.architecture.findings = [...response.output.findings];
    currentState.architecture.analysisSummary = response.output.riskSummary;
    assertProjectState(currentState);
    await this.stateStore.save(currentState);

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'architecture_analysis',
      title: 'Architecture analysis',
      metadata: {
        promptId: prompt.id,
        findings: String(response.output.findings.length),
      },
      createdAt: new Date().toISOString(),
    });

    const highestRiskFinding = response.output.findings[0];
    if (highestRiskFinding) {
      await this.stateStore.recordDecision({
        id: crypto.randomUUID(),
        title: 'Architecture baseline established',
        decision: `Prioritize ${highestRiskFinding.subsystem} ${highestRiskFinding.issueType} follow-up before broad feature expansion.`,
        rationale: response.output.riskSummary,
        affectedAreas: highestRiskFinding.affectedModules,
        createdAt: new Date().toISOString(),
      });
    }

    await this.stateStore.recordEvent(
      makeEvent('ARCHITECTURE_ANALYZED', {
        findings: response.output.findings.length,
      }),
    );

    this.logger.info('Architecture analysis completed', {
      event: 'architecture_analyzed',
      result: 'ok',
      data: {
        findings: response.output.findings.length,
      },
    });

    return response.output;
  }
}

function makeArchitectRoleRequest(
  state: ProjectState,
  sourceImports: Record<string, string[]>,
  outputSchema: Record<string, unknown>,
): RoleRequest<{
  discovery: ProjectState['discovery'];
  sourceImports: Record<string, string[]>;
}> {
  return {
    role: 'architect',
    objective: 'Produce grounded architecture findings',
    input: {
      discovery: state.discovery,
      sourceImports,
    },
    acceptanceCriteria: [
      'Ground findings in discovery output and structural evidence',
      'Return structured findings that can drive decisions and planning',
    ],
    expectedOutputSchema: outputSchema,
  };
}

function collectSourceImports(rootPath: string): Record<string, string[]> {
  const sourceFiles = [
    ...collectSourceFiles(rootPath, 'apps'),
    ...collectSourceFiles(rootPath, 'packages'),
  ];

  return Object.fromEntries(
    sourceFiles.map((filePath) => [
      filePath,
      extractImports(readFileSafe(path.resolve(rootPath, filePath))),
    ]),
  );
}

function collectSourceFiles(rootPath: string, segment: string): string[] {
  const segmentPath = path.resolve(rootPath, segment);
  if (!isDirectory(segmentPath)) {
    return [];
  }

  const results: string[] = [];
  walkDirectory(rootPath, segmentPath, results);
  return results;
}

function walkDirectory(rootPath: string, currentPath: string, results: string[]): void {
  for (const entry of readdirSafe(currentPath)) {
    const targetPath = path.resolve(currentPath, entry);
    if (isDirectory(targetPath)) {
      walkDirectory(rootPath, targetPath, results);
      continue;
    }

    if (entry.endsWith('.ts')) {
      results.push(path.relative(rootPath, targetPath));
    }
  }
}

function extractImports(content: string): string[] {
  return [...content.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '');
}

function readFileSafe(targetPath: string): string {
  try {
    return readFileSync(targetPath, 'utf8');
  } catch {
    return '';
  }
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
