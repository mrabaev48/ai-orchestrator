import {
  assertProjectState,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
} from '../../../core/src/index.ts';
import type { StateStore, RecordFailureInput } from '../StateStore.ts';
import { StateStoreError } from '../../../shared/src/index.ts';

export class InMemoryStateStore implements StateStore {
  private state: ProjectState;
  readonly events: DomainEvent[] = [];

  constructor(initialState: ProjectState) {
    assertProjectState(initialState);
    this.state = structuredClone(initialState);
  }

  async load(): Promise<ProjectState> {
    return structuredClone(this.state);
  }

  async save(state: ProjectState): Promise<void> {
    assertProjectState(state);
    this.state = structuredClone(state);
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async recordFailure(input: RecordFailureInput): Promise<FailureRecord> {
    const current = await this.load();
    if (!current.backlog.tasks[input.taskId]) {
      throw new StateStoreError(`Cannot record failure for missing task ${input.taskId}`);
    }

    const failure: FailureRecord = {
      id: crypto.randomUUID(),
      taskId: input.taskId,
      role: input.role,
      reason: input.reason,
      symptoms: input.symptoms ?? [],
      badPatterns: input.badPatterns ?? [],
      retrySuggested: input.retrySuggested ?? true,
      createdAt: new Date().toISOString(),
    };

    current.failures.push(failure);
    current.execution.retryCounts[input.taskId] = (current.execution.retryCounts[input.taskId] ?? 0) + 1;
    await this.save(current);
    return failure;
  }

  async recordArtifact(artifact: ArtifactRecord): Promise<void> {
    const current = await this.load();
    current.artifacts.push(structuredClone(artifact));
    await this.save(current);
  }

  async recordDecision(decision: DecisionLogItem): Promise<void> {
    const current = await this.load();
    current.decisions.push(structuredClone(decision));
    await this.save(current);
  }

  async markTaskDone(taskId: string, summary: string): Promise<void> {
    const current = await this.load();
    const task = current.backlog.tasks[taskId];
    if (!task) {
      throw new StateStoreError(`Cannot mark missing task ${taskId} as done`);
    }

    task.status = 'done';
    if (!current.execution.completedTaskIds.includes(taskId)) {
      current.execution.completedTaskIds.push(taskId);
    }
    current.execution.activeTaskId = undefined;
    current.artifacts.push({
      id: crypto.randomUUID(),
      type: 'run_summary',
      title: `Task ${taskId} completion summary`,
      metadata: {
        taskId,
        summary,
      },
      createdAt: new Date().toISOString(),
    });
    await this.save(current);
  }
}
