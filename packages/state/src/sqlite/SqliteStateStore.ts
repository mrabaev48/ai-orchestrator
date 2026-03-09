import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  assertProjectState,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
  makeEvent,
} from '../../../core/src/index.ts';
import { StateStoreError, redactSecrets } from '../../../shared/src/index.ts';
import type { RecordFailureInput, StateStore } from '../StateStore.ts';
import { sqliteSchemaStatements } from './schema.ts';

export class SqliteStateStore implements StateStore {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;
  private readonly initialState: ProjectState;

  constructor(dbPath: string, initialState: ProjectState) {
    this.dbPath = dbPath;
    this.initialState = initialState;
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    for (const statement of sqliteSchemaStatements) {
      this.db.exec(statement);
    }
  }

  async load(): Promise<ProjectState> {
    const row = this.db
      .prepare('SELECT snapshot_json FROM project_snapshots ORDER BY created_at DESC LIMIT 1')
      .get() as { snapshot_json?: string } | undefined;

    if (!row?.snapshot_json) {
      return structuredClone(this.initialState);
    }

    try {
      const state = JSON.parse(row.snapshot_json) as ProjectState;
      assertProjectState(state);
      return state;
    } catch (error) {
      throw new StateStoreError('Unable to load project state snapshot', { cause: error });
    }
  }

  async save(state: ProjectState): Promise<void> {
    assertProjectState(state);
    this.withTransaction(() => {
      this.insertSnapshot(state);
    });
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    this.withTransaction(() => {
      this.insertEvent(event);
    });
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

    this.withTransaction(() => {
      this.db
        .prepare(
          `INSERT INTO failure_log (
            id, task_id, role, reason, symptoms_json, bad_patterns_json, retry_suggested, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          failure.id,
          failure.taskId,
          failure.role,
          failure.reason,
          JSON.stringify(failure.symptoms),
          JSON.stringify(failure.badPatterns),
          failure.retrySuggested ? 1 : 0,
          failure.createdAt,
        );
      this.insertSnapshot(current);
    });

    return failure;
  }

  async recordArtifact(artifact: ArtifactRecord): Promise<void> {
    const current = await this.load();
    current.artifacts.push(structuredClone(artifact));
    this.withTransaction(() => {
      this.db
        .prepare(
          'INSERT INTO artifact_log (id, type, title, location, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          artifact.id,
          artifact.type,
          artifact.title,
          artifact.location ?? null,
          JSON.stringify(redactSecrets(artifact.metadata)),
          artifact.createdAt,
        );
      this.insertSnapshot(current);
    });
  }

  async recordDecision(decision: DecisionLogItem): Promise<void> {
    const current = await this.load();
    current.decisions.push(structuredClone(decision));
    this.withTransaction(() => {
      this.db
        .prepare(
          'INSERT INTO decision_log (id, created_at, title, decision, rationale, affected_areas_json) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          decision.id,
          decision.createdAt,
          decision.title,
          decision.decision,
          decision.rationale,
          JSON.stringify(decision.affectedAreas),
        );
      this.insertSnapshot(current);
    });
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

    const event = makeEvent('TASK_COMPLETED', {
      taskId,
      summary,
    }, { runId: current.execution.activeRunId });

    this.withTransaction(() => {
      this.insertEvent(event);
      this.insertSnapshot(current);
    });
  }

  private insertSnapshot(state: ProjectState): void {
    this.db
      .prepare('INSERT INTO project_snapshots (id, created_at, snapshot_json) VALUES (?, ?, ?)')
      .run(crypto.randomUUID(), new Date().toISOString(), JSON.stringify(redactSecrets(state)));
  }

  private insertEvent(event: DomainEvent): void {
    this.db
      .prepare(
        'INSERT INTO domain_events (id, event_type, created_at, run_id, payload_json) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        event.id,
        event.eventType,
        event.createdAt,
        event.runId ?? null,
        JSON.stringify(redactSecrets(event.payload)),
      );
  }

  private withTransaction(action: () => void): void {
    this.db.exec('BEGIN');
    try {
      action();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw new StateStoreError('SQLite state transaction failed', { cause: error });
    }
  }
}
