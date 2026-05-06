import type { BacklogTask, ProjectState } from '@ai-orchestrator/core';
import type { RuntimeConfig } from '@ai-orchestrator/shared';
import { createLocalToolSet, type ToolSet } from '@ai-orchestrator/tools';

import type { ManagedWorkspace, WorkspaceManager } from '../workspace-manager.js';
import type { GitLifecycleCoordinator } from '../git/git-lifecycle-coordinator.js';
import { makeArtifact } from '../runtime-utils.js';
import type { StateStore } from '@ai-orchestrator/state';

export interface WorkspaceRunContext {
  state: ProjectState;
  task: BacklogTask;
  runId: string;
  workspace: ManagedWorkspace;
  workspaceTools: ToolSet;
  abortSignal?: AbortSignal;
}

export interface WorkspaceRunInput<TResult> {
  state: ProjectState;
  task: BacklogTask;
  runId: string;
  abortSignal?: AbortSignal;
  execute: (context: WorkspaceRunContext) => Promise<TResult>;
}

export class WorkspaceRunCoordinator {
  constructor(
    private readonly input: {
      stateStore: StateStore;
      config: RuntimeConfig;
      workspaceManager: WorkspaceManager;
      gitLifecycleCoordinator: GitLifecycleCoordinator;
    },
  ) {}

  async run<TResult>(input: WorkspaceRunInput<TResult>): Promise<TResult> {
    const workspace = await this.input.workspaceManager.allocate({
      runId: input.runId,
      tenantId: input.state.orgId,
      projectId: input.state.projectId,
      taskId: input.task.id,
    });
    const workspaceTools = createLocalToolSet({
      allowedWritePaths: [workspace.rootPath],
      allowedShellCommands: this.input.config.tools.allowedShellCommands,
      ...(this.input.config.tools.writeMode ? { writeMode: this.input.config.tools.writeMode } : {}),
      ...(this.input.config.tools.protectedWritePaths
        ? { protectedWritePaths: this.input.config.tools.protectedWritePaths }
        : {}),
      ...(typeof this.input.config.tools.maxModifiedFiles === 'number'
        ? { maxModifiedFiles: this.input.config.tools.maxModifiedFiles }
        : {}),
    });

    const workspaceArtifact = makeArtifact('report', `Workspace initialized for ${input.task.id}`, {
      runId: input.runId,
      taskId: input.task.id,
      workspaceRoot: workspace.rootPath,
      hasInitialDiff: workspace.initialDiff.length > 0 ? 'true' : 'false',
    });
    const workspaceArtifactResult = await this.input.stateStore.recordArtifact(
      workspaceArtifact,
      { expectedRevision: input.state.revision },
    );
    input.state.revision = workspaceArtifactResult.revision;
    input.state.artifacts.push(workspaceArtifact);
    await this.input.gitLifecycleCoordinator.recordBranchArtifact(input.state, {
      runId: input.runId,
      taskId: input.task.id,
      ...(workspace.branchName ? { branchName: workspace.branchName } : {}),
    });

    try {
      return await input.execute({
        state: input.state,
        task: input.task,
        runId: input.runId,
        workspace,
        workspaceTools,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch (error) {
      await workspace.rollback().catch(() => {});
      throw error;
    } finally {
      await workspace.cleanup().catch(() => {});
    }
  }
}
