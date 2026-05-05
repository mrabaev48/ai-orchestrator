import path from 'node:path';

import { defaultExecutionPolicyEngine } from '@ai-orchestrator/core';
import { buildDocsWriterPrompt } from '@ai-orchestrator/prompts';
import type { Logger, RuntimeConfig } from '@ai-orchestrator/shared';
import { createLocalToolSet } from '@ai-orchestrator/tools';
import type { RoleRequest } from '@ai-orchestrator/core';
import type { ApplicationRoleRegistry, ApplicationStateStore } from './ports.js';
import { assertRoleOutput } from './role-output-validation.js';

interface DocumentationOutput {
  summary: string;
  affectedModules: string[];
  behaviorChanges: string[];
  designRationale: string[];
  followUpGaps: string[];
  markdown: string;
}

export class DocumentationService {
  private readonly stateStore: ApplicationStateStore;
  private readonly roleRegistry: ApplicationRoleRegistry;
  private readonly logger: Logger;
  private readonly toolSet: ReturnType<typeof createLocalToolSet>;
  private readonly allowedWritePaths: string[];

  constructor(
    stateStore: ApplicationStateStore,
    roleRegistry: ApplicationRoleRegistry,
    config: RuntimeConfig,
    logger: Logger,
  ) {
    this.stateStore = stateStore;
    this.roleRegistry = roleRegistry;
    this.logger = logger;
    this.allowedWritePaths = config.tools.allowedWritePaths;
    this.toolSet = createLocalToolSet({
      allowedWritePaths: config.tools.allowedWritePaths,
      allowedShellCommands: config.tools.allowedShellCommands,
    });
  }

  async generate(out?: string): Promise<string> {
    const state = await this.stateStore.load();
    const affectedModules = collectAffectedModules(state);
    const behaviorChanges = collectBehaviorChanges(state);
    const designRationale = collectDesignRationale(state);
    const followUpGaps = collectFollowUpGaps(state);
    const prompt = buildDocsWriterPrompt({
      projectName: state.projectName,
      summary: state.summary,
      affectedModules,
      behaviorChanges,
      designRationale,
      followUpGaps,
    });
    const docsWriter = this.roleRegistry.get<
      {
        projectName: string;
        summary: string;
        affectedModules: string[];
        behaviorChanges: string[];
        designRationale: string[];
        followUpGaps: string[];
      },
      DocumentationOutput
    >('docs_writer');
    const response = await docsWriter.execute(
      makeDocsWriterRequest(state.projectName, state.summary, affectedModules, behaviorChanges, designRationale, followUpGaps, prompt.outputSchema),
      defaultExecutionPolicyEngine.resolve({
        runId: crypto.randomUUID(),
        role: 'docs_writer',
        stateSummary: state.summary,
        workspaceRoot: process.cwd(),
        allowedWritePaths: this.allowedWritePaths,
        evidenceSource: 'artifacts',
        logger: this.logger,
      }),
    );
    await docsWriter.validate?.(response);
    assertRoleOutput('docs_writer', response);

    const outputPath = path.resolve(process.cwd(), out ?? 'artifacts/generated-docs.md');
    await this.toolSet.fileSystem.writeFile(outputPath, response.output.markdown);
    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'documentation',
      title: 'Generated documentation summary',
      location: outputPath,
      metadata: {
        promptId: prompt.id,
        affectedModules: String(response.output.affectedModules.length),
      },
      createdAt: new Date().toISOString(),
    });

    this.logger.info('Documentation artifact generated', {
      event: 'documentation_generated',
      result: 'ok',
      data: {
        outputPath,
      },
    });

    return outputPath;
  }
}

function makeDocsWriterRequest(
  projectName: string,
  summary: string,
  affectedModules: string[],
  behaviorChanges: string[],
  designRationale: string[],
  followUpGaps: string[],
  outputSchema: Record<string, unknown>,
): RoleRequest<{
  projectName: string;
  summary: string;
  affectedModules: string[];
  behaviorChanges: string[];
  designRationale: string[];
  followUpGaps: string[];
}> {
  return {
    role: 'docs_writer',
    objective: 'Generate bounded technical documentation summary',
    input: {
      projectName,
      summary,
      affectedModules,
      behaviorChanges,
      designRationale,
      followUpGaps,
    },
    acceptanceCriteria: [
      'Document only confirmed behavior and architecture changes',
      'Keep the output reviewable and bounded to current state',
    ],
    expectedOutputSchema: outputSchema,
  };
}

function collectAffectedModules(state: Awaited<ReturnType<ApplicationStateStore['load']>>): string[] {
  const modules = new Set<string>();

  for (const finding of state.architecture.findings) {
    for (const affectedModule of finding.affectedModules) {
      modules.add(affectedModule);
    }
  }

  for (const task of Object.values(state.backlog.tasks)) {
    if (task.status === 'done' || task.splitFromTaskId) {
      for (const affectedModule of task.affectedModules) {
        modules.add(affectedModule);
      }
    }
  }

  return [...modules].sort();
}

function collectBehaviorChanges(state: Awaited<ReturnType<ApplicationStateStore['load']>>): string[] {
  const changes: string[] = [];

  if (state.architecture.findings.length > 0) {
    changes.push(`Architecture analysis recorded ${state.architecture.findings.length} finding(s).`);
  }

  if (Object.keys(state.backlog.tasks).length > 0) {
    changes.push(`Backlog contains ${Object.keys(state.backlog.tasks).length} executable task(s).`);
  }

  if (state.execution.blockedTaskIds.length > 0) {
    changes.push(`Blocked tasks currently tracked: ${state.execution.blockedTaskIds.join(', ')}.`);
  }

  return changes;
}

function collectDesignRationale(state: Awaited<ReturnType<ApplicationStateStore['load']>>): string[] {
  return state.decisions.map((decision) => `${decision.title}: ${decision.rationale}`);
}

function collectFollowUpGaps(state: Awaited<ReturnType<ApplicationStateStore['load']>>): string[] {
  if (state.execution.blockedTaskIds.length === 0) {
    return ['No blocked tasks currently require documentation follow-up.'];
  }

  return state.execution.blockedTaskIds.map((taskId) => `Investigate blocked task ${taskId}.`);
}
