import {
  assertProjectState,
  defaultArtifactSchemaRegistry,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
  type RunStepLogEntry,
  makeEvent,
} from '../../../core/src/index.ts';
import { StateStoreError, redactSecrets } from '../../../shared/src/index.ts';
import type { ListEventsQuery, ListRunStepsQuery, RecordFailureInput, StateStore } from '../StateStore.ts';
import { createPostgresMigrations } from './migrations.ts';

interface PgPoolLike {
  connect: () => Promise<PgClientLike>;
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
}

interface PgClientLike {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
}

type PgModule = {
  Pool: new (options: { connectionString: string }) => PgPoolLike;
};

export class PostgresStateStore implements StateStore {
  private readonly poolPromise: Promise<PgPoolLike>;
  private readonly initialState: ProjectState;
  private readonly schema: string;
  private initialization: Promise<void> | null = null;

  constructor(connectionString: string, initialState: ProjectState, schema = 'public') {
    this.poolPromise = loadPgPool(connectionString);
    this.initialState = initialState;
    this.schema = schema;
  }

  async load(): Promise<ProjectState> {
    await this.ensureInitialized();
    const pool = await this.poolPromise;

    const result = (await pool.query(
      `SELECT snapshot_json
       FROM ${this.table('project_snapshots')}
       ORDER BY created_at DESC
       LIMIT 1`,
    )) as { rows: { snapshot_json: ProjectState }[] };

    const row = result.rows[0];
    if (!row?.snapshot_json) {
      return structuredClone(this.initialState);
    }

    try {
      assertProjectState(row.snapshot_json);
      return structuredClone(row.snapshot_json);
    } catch (error) {
      throw new StateStoreError('Unable to load project state snapshot', { cause: error });
    }
  }

  async save(state: ProjectState): Promise<void> {
    assertProjectState(state);
    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await this.insertSnapshot(client, state);
    });
  }

  async saveWithEvents(state: ProjectState, events: readonly DomainEvent[]): Promise<void> {
    assertProjectState(state);
    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await this.insertSnapshot(client, state);
      for (const event of events) {
        await this.insertEvent(client, event);
      }
    });
  }

  async listEvents(query: ListEventsQuery = {}): Promise<DomainEvent[]> {
    await this.ensureInitialized();
    const pool = await this.poolPromise;
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (query.eventType) {
      clauses.push(`event_type = $${params.length + 1}`);
      params.push(query.eventType);
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    params.push(limit, offset);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = (await pool.query(
      `SELECT id, event_type, created_at, run_id, payload_json
       FROM ${this.table('domain_events')}
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    )) as {
      rows: {
      id: string;
      event_type: DomainEvent['eventType'];
      created_at: string;
      run_id: string | null;
      payload_json: DomainEvent['payload'];
      }[];
    };

    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      createdAt: row.created_at,
      payload: row.payload_json,
      ...(row.run_id ? { runId: row.run_id } : {}),
    }));
  }

  async listRunSteps(query: ListRunStepsQuery = {}): Promise<RunStepLogEntry[]> {
    await this.ensureInitialized();
    const pool = await this.poolPromise;
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    if (query.runId) {
      clauses.push(`run_id = $${params.length + 1}`);
      params.push(query.runId);
    }
    if (query.taskId) {
      clauses.push(`task_id = $${params.length + 1}`);
      params.push(query.taskId);
    }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    params.push(limit, offset);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = (await pool.query(
      `SELECT id, run_id, task_id, role, tool, input_text, output_text, status, duration_ms, created_at
       FROM ${this.table('run_step_log')}
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    )) as {
      rows: {
        id: string;
        run_id: string;
        task_id: string | null;
        role: string;
        tool: string | null;
        input_text: string;
        output_text: string;
        status: RunStepLogEntry['status'];
        duration_ms: number;
        created_at: string;
      }[];
    };

    return result.rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      ...(row.task_id ? { taskId: row.task_id } : {}),
      role: row.role,
      ...(row.tool ? { tool: row.tool } : {}),
      input: row.input_text,
      output: row.output_text,
      status: row.status,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }));
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await this.insertEvent(client, event);
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

    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('failure_log')} (
          id, task_id, role, reason, symptoms_json, bad_patterns_json, retry_suggested, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
        [
          failure.id,
          failure.taskId,
          failure.role,
          failure.reason,
          JSON.stringify(failure.symptoms),
          JSON.stringify(failure.badPatterns),
          failure.retrySuggested,
          failure.createdAt,
        ],
      );
      await this.insertSnapshot(client, current);
    });

    return failure;
  }

  async recordArtifact(artifact: ArtifactRecord): Promise<void> {
    const issues = defaultArtifactSchemaRegistry.validate(artifact);
    if (issues.length > 0) {
      throw new StateStoreError('Artifact schema validation failed', {
        details: { artifactType: artifact.type, issues },
      });
    }

    const current = await this.load();
    current.artifacts.push(structuredClone(artifact));

    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('artifact_log')} (
          id, type, title, location, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        [
          artifact.id,
          artifact.type,
          artifact.title,
          artifact.location ?? null,
          JSON.stringify(redactSecrets(artifact.metadata)),
          artifact.createdAt,
        ],
      );
      await this.insertSnapshot(client, current);
    });
  }

  async recordDecision(decision: DecisionLogItem): Promise<void> {
    const current = await this.load();
    current.decisions.push(structuredClone(decision));

    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('decision_log')} (
          id, created_at, title, decision, rationale, affected_areas_json
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          decision.id,
          decision.createdAt,
          decision.title,
          decision.decision,
          decision.rationale,
          JSON.stringify(decision.affectedAreas),
        ],
      );
      await this.insertSnapshot(client, current);
    });
  }

  async recordRunStep(step: RunStepLogEntry): Promise<void> {
    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('run_step_log')} (
          id, run_id, task_id, role, tool, input_text, output_text, status, duration_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          step.id,
          step.runId,
          step.taskId ?? null,
          step.role,
          step.tool ?? null,
          step.input,
          step.output,
          step.status,
          step.durationMs,
          step.createdAt,
        ],
      );
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
    delete current.execution.activeTaskId;

    const event = makeEvent(
      'TASK_COMPLETED',
      { taskId, summary },
      current.execution.activeRunId ? { runId: current.execution.activeRunId } : {},
    );

    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await this.insertEvent(client, event);
      await this.insertSnapshot(client, current);
    });
  }

  private table(name: string): string {
    const normalizedSchema = this.schema.replace(/"/g, '""');
    const normalizedTable = name.replace(/"/g, '""');
    return `"${normalizedSchema}"."${normalizedTable}"`;
  }

  private async ensureInitialized(): Promise<void> {
    this.initialization ??= this.initialize();
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    const pool = await this.poolPromise;
    try {
      await pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema.replace(/"/g, '""')}"`);
      const migrations = createPostgresMigrations((name) => this.table(name));
      for (const migration of migrations) {
        for (const statement of migration.statements) {
          await pool.query(statement);
        }
      }
    } catch (error) {
      throw new StateStoreError('Unable to initialize PostgreSQL state store', { cause: error });
    }
  }

  private async insertSnapshot(client: PgClientLike, state: ProjectState): Promise<void> {
    assertProjectState(state);
    await client.query(
      `INSERT INTO ${this.table('project_snapshots')} (id, created_at, snapshot_json)
       VALUES ($1, $2, $3::jsonb)`,
      [crypto.randomUUID(), new Date().toISOString(), JSON.stringify(redactSecrets(state))],
    );
  }

  private async insertEvent(client: PgClientLike, event: DomainEvent): Promise<void> {
    await client.query(
      `INSERT INTO ${this.table('domain_events')} (
        id, event_type, created_at, run_id, payload_json
      ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        event.id,
        event.eventType,
        event.createdAt,
        event.runId ?? null,
        JSON.stringify(redactSecrets(event.payload)),
      ],
    );
  }

  private async withTransaction<T>(action: (client: PgClientLike) => Promise<T>): Promise<T> {
    const pool = await this.poolPromise;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw new StateStoreError('PostgreSQL state transaction failed', { cause: error });
    } finally {
      client.release();
    }
  }
}

async function loadPgPool(connectionString: string): Promise<PgPoolLike> {
  try {
    const pgModule = (await import('pg')) as PgModule;
    return new pgModule.Pool({ connectionString });
  } catch (error) {
    throw new StateStoreError(
      'PostgreSQL backend requires the "pg" package to be installed and resolvable at runtime',
      { cause: error },
    );
  }
}
