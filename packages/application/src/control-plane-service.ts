import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { makeEvent, type ProjectState } from '../../core/src/index.ts';
import { WorkflowPolicyError } from '../../shared/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';
import { toBacklogExportView, toStateSummaryView, type StateSummaryView } from './read-models.ts';

export class ControlPlaneService {
  private readonly stateStore: StateStore;
  private readonly logger: Logger;

  constructor(stateStore: StateStore, logger: Logger) {
    this.stateStore = stateStore;
    this.logger = logger;
  }

  async bootstrap(state: ProjectState, snapshotOnBootstrap: boolean): Promise<void> {
    if (snapshotOnBootstrap) {
      await this.stateStore.save(state);
    }

    await this.stateStore.recordEvent(
      makeEvent('BOOTSTRAP_COMPLETED', {
        projectId: state.projectId,
        projectName: state.projectName,
      }),
    );

    this.logger.info('Bootstrap completed', {
      event: 'bootstrap_completed',
      result: 'ok',
    });
  }

  async showState(): Promise<{ raw: ProjectState; summary: StateSummaryView }> {
    const state = await this.stateStore.load();
    return {
      raw: state,
      summary: toStateSummaryView(state),
    };
  }

  async exportBacklog(format: 'md' | 'json', out?: string): Promise<string> {
    const state = await this.stateStore.load();
    const exportView = toBacklogExportView(state);
    const outputPath = path.resolve(process.cwd(), out ?? `artifacts/backlog-export.${format}`);

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, format === 'json' ? exportView.json : exportView.markdown, 'utf8');

    await this.stateStore.recordArtifact({
      id: crypto.randomUUID(),
      type: 'backlog_export',
      title: 'Backlog export',
      location: outputPath,
      metadata: {
        format,
      },
      createdAt: new Date().toISOString(),
    });

    return outputPath;
  }

  async resumeFailure(failureId: string): Promise<void> {
    const state = await this.stateStore.load();
    const failure = state.failures.find((item) => item.id === failureId);
    if (!failure) {
      throw new WorkflowPolicyError(`Failure ${failureId} not found`, {
        details: { failureId, operation: 'resume_failure' },
      });
    }
    if ((failure.status ?? 'retryable') !== 'dead_lettered') {
      throw new WorkflowPolicyError(`Failure ${failureId} is not dead-lettered`, {
        details: { failureId, status: failure.status ?? 'retryable', operation: 'resume_failure' },
      });
    }

    failure.status = 'resumed';
    failure.resumedAt = new Date().toISOString();
    const task = state.backlog.tasks[failure.taskId];
    if (task?.status === 'blocked') {
      task.status = 'todo';
      state.execution.blockedTaskIds = state.execution.blockedTaskIds.filter((taskId) => taskId !== task.id);
    }
    await this.stateStore.saveWithEvents(state, [
      makeEvent(
        'APPROVAL_RESUMED',
        { failureId, taskId: failure.taskId },
        failure.checkpointRunId ? { runId: failure.checkpointRunId } : {},
      ),
    ]);
  }

  async replayFromFailureCheckpoint(failureId: string): Promise<{ taskId: string; runId?: string }> {
    const state = await this.stateStore.load();
    const failure = state.failures.find((item) => item.id === failureId);
    if (!failure) {
      throw new WorkflowPolicyError(`Failure ${failureId} not found`, {
        details: { failureId, operation: 'replay_failure' },
      });
    }

    failure.status = 'replayed';
    failure.replayedAt = new Date().toISOString();
    if (failure.checkpointRunId) {
      state.execution.activeRunId = failure.checkpointRunId;
    } else {
      delete state.execution.activeRunId;
    }
    state.execution.activeTaskId = failure.taskId;
    await this.stateStore.saveWithEvents(state, [
      makeEvent(
        'TASK_SELECTED',
        { taskId: failure.taskId, replayFromFailureId: failure.id },
        failure.checkpointRunId ? { runId: failure.checkpointRunId } : {},
      ),
    ]);

    return { taskId: failure.taskId, ...(failure.checkpointRunId ? { runId: failure.checkpointRunId } : {}) };
  }
}
