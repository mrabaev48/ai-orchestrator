import {
  assertProjectState,
  defaultArtifactSchemaRegistry,
  verifyRunStepEvidenceChain,
  assertRunStepTransitionAllowed,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
  type RunStepLogEntry,
  type ExecutionPolicyDecision,
  makeEvent,
} from '@ai-orchestrator/core';
import { StateStoreError, redactSecrets } from '@ai-orchestrator/shared';
import type {
  ListEventsQuery,
  ListRunStepsQuery,
  PolicyDecisionQuery,
  RecordFailureInput,
  RecordFailureResult,
  StateMutationResult,
  StateStore,
  StateWriteOptions,
} from '../StateStore.js';
import { createPostgresMigrations } from './migrations.js';
import { expectedRevisionFor, stateRevisionConflict } from '../revision.js';

interface PgPoolLike {
  connect: () => Promise<PgClientLike>;
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
}

interface PgClientLike {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
}

interface PgModule {
  Pool: new (options: { connectionString: string }) => PgPoolLike;
}

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

  private get tenantScope(): { orgId: string; projectId: string } {
    return { orgId: this.initialState.orgId, projectId: this.initialState.projectId };
  }

  async load(): Promise<ProjectState> {
    await this.ensureInitialized();
    const pool = await this.poolPromise;

    const result = (await pool.query(
      `SELECT snapshot_json, revision
       FROM ${this.table('project_snapshots')}
       WHERE org_id = $1 AND project_id = $2
       ORDER BY revision DESC, created_at DESC
       LIMIT 1`,
      [this.tenantScope.orgId, this.tenantScope.projectId],
    )) as { rows: { snapshot_json: ProjectState; revision: string | number }[] };

    const row = result.rows[0];
    if (!row?.snapshot_json) {
      return structuredClone(this.initialState);
    }

    try {
      const loaded = structuredClone(row.snapshot_json);
      loaded.revision = Number(row.revision);
      assertProjectState(loaded);
      return loaded;
    } catch (error) {
      throw new StateStoreError('Unable to load project state snapshot', { cause: error });
    }
  }

  async save(state: ProjectState, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    assertProjectState(state);
    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      return await this.insertSnapshot(client, state, options);
    });
    state.revision = revision;
    return { revision };
  }

  async saveWithEvents(
    state: ProjectState,
    events: readonly DomainEvent[],
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
    assertProjectState(state);
    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      const nextRevision = await this.insertSnapshot(client, state, options);
      for (const event of events) {
        await this.insertEvent(client, event);
      }
      return nextRevision;
    });
    state.revision = revision;
    return { revision };
  }

  async listEvents(query: ListEventsQuery = {}): Promise<DomainEvent[]> {
    await this.ensureInitialized();
    const pool = await this.poolPromise;
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    clauses.push(`org_id = $${params.length + 1}`);
    params.push(this.tenantScope.orgId);
    clauses.push(`project_id = $${params.length + 1}`);
    params.push(this.tenantScope.projectId);
    if (query.eventType) { clauses.push(`event_type = $${params.length + 1}`); params.push(query.eventType); }

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

    clauses.push(`org_id = $${params.length + 1}`);
    params.push(this.tenantScope.orgId);
    clauses.push(`project_id = $${params.length + 1}`);
    params.push(this.tenantScope.projectId);
    if (query.runId) { clauses.push(`run_id = $${params.length + 1}`); params.push(query.runId); }
    if (query.taskId) { clauses.push(`task_id = $${params.length + 1}`); params.push(query.taskId); }

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    params.push(limit, offset);

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = (await pool.query(
      `SELECT id, tenant_id, project_scope_id, run_id, step_id, attempt, task_id, role, tool, input_text, output_text, status, policy_decision_id, idempotency_key, payload_ref, checksum, prev_checksum, trace_id, duration_ms, created_at
       FROM ${this.table('run_step_log')}
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
       OFFSET $${params.length}`,
      params,
    )) as {
      rows: {
        id: string;
        tenant_id: string;
        project_scope_id: string;
        run_id: string;
        step_id: string;
        attempt: number;
        task_id: string | null;
        role: string;
        tool: string | null;
        input_text: string;
        output_text: string;
        status: RunStepLogEntry['status'];
        policy_decision_id: string | null;
        idempotency_key: string;
        payload_ref: string | null;
        checksum: string;
        prev_checksum: string | null;
        trace_id: string;
        duration_ms: number;
        created_at: string;
      }[];
    };

    const mapped = result.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      projectId: row.project_scope_id,
      runId: row.run_id,
      stepId: row.step_id,
      attempt: row.attempt,
      ...(row.task_id ? { taskId: row.task_id } : {}),
      role: row.role,
      ...(row.tool ? { tool: row.tool } : {}),
      input: row.input_text,
      output: row.output_text,
      status: row.status,
      ...(row.policy_decision_id ? { policyDecisionId: row.policy_decision_id } : {}),
      idempotencyKey: row.idempotency_key,
      ...(row.payload_ref ? { payloadRef: row.payload_ref } : {}),
      checksum: row.checksum,
      ...(row.prev_checksum ? { prevChecksum: row.prev_checksum } : {}),
      traceId: row.trace_id,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }));

    if (query.runId) {
      const issues = verifyRunStepEvidenceChain(mapped);
      if (issues.length > 0) {
        throw new StateStoreError('EVIDENCE_INTEGRITY_VIOLATION', {
          details: { runId: query.runId, issues },
        });
      }
    }

    return mapped;
  }

  async recordEvent(event: DomainEvent): Promise<void> {
    await this.ensureInitialized();
    await this.withTransaction(async (client) => {
      await this.insertEvent(client, event);
    });
  }

  async recordFailure(input: RecordFailureInput, options: StateWriteOptions = {}): Promise<RecordFailureResult> {
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
    const revision = await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('failure_log')} (
          id, org_id, project_id, task_id, role, reason, symptoms_json, bad_patterns_json, retry_suggested, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
        [
          failure.id,
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          failure.taskId,
          failure.role,
          failure.reason,
          JSON.stringify(failure.symptoms),
          JSON.stringify(failure.badPatterns),
          failure.retrySuggested,
          failure.createdAt,
        ],
      );
      return await this.insertSnapshot(client, current, options.expectedRevision != null ? options : {
        expectedRevision: current.revision,
      });
    });

    return { failure, revision };
  }

  async recordArtifact(artifact: ArtifactRecord, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    const issues = defaultArtifactSchemaRegistry.validate(artifact);
    if (issues.length > 0) {
      throw new StateStoreError('Artifact schema validation failed', {
        details: { artifactType: artifact.type, issues },
      });
    }

    const current = await this.load();
    if (!current.artifacts.some((item) => item.id === artifact.id)) {
      current.artifacts.push(structuredClone(artifact));
    }

    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('artifact_log')} (
          id, org_id, project_id, type, title, location, metadata_json, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          artifact.id,
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          artifact.type,
          artifact.title,
          artifact.location ?? null,
          JSON.stringify(redactSecrets(artifact.metadata)),
          artifact.createdAt,
        ],
      );
      return await this.insertSnapshot(client, current, options.expectedRevision != null ? options : {
        expectedRevision: current.revision,
      });
    });
    return { revision };
  }

  async recordDecision(decision: DecisionLogItem, options: StateWriteOptions = {}): Promise<StateMutationResult> {
    const current = await this.load();
    current.decisions.push(structuredClone(decision));

    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      await client.query(
        `INSERT INTO ${this.table('decision_log')} (
          id, org_id, project_id, created_at, title, decision, rationale, affected_areas_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
        [
          decision.id,
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          decision.createdAt,
          decision.title,
          decision.decision,
          decision.rationale,
          JSON.stringify(decision.affectedAreas),
        ],
      );
      return await this.insertSnapshot(client, current, options.expectedRevision != null ? options : {
        expectedRevision: current.revision,
      });
    });
    return { revision };
  }


  async recordPolicyDecision(
    decision: ExecutionPolicyDecision,
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
    const current = await this.load();
    current.policyDecisions.push(structuredClone(decision));

    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      return await this.insertSnapshot(client, current, options.expectedRevision != null ? options : {
        expectedRevision: current.revision,
      });
    });
    return { revision };
  }

  async getPolicyDecision(query: PolicyDecisionQuery): Promise<ExecutionPolicyDecision | null> {
    const current = await this.load();
    const found = current.policyDecisions
      .slice()
      .reverse()
      .find((item) => item.runId === query.runId
        && item.stepId === query.stepId
        && item.attempt === query.attempt
        && item.actionType === query.actionType);
    return found ? structuredClone(found) : null;
  }

  async recordRunStep(step: RunStepLogEntry): Promise<StateMutationResult> {
    await this.ensureInitialized();
    const revision = await this.withTransaction(async (client) => {
      const previousResult = (await client.query(
        `SELECT status
         FROM ${this.table('run_step_log')}
         WHERE org_id = $1 AND project_id = $2 AND run_id = $3 AND step_id = $4 AND attempt = $5
         ORDER BY created_at DESC
         LIMIT 1`,
        [
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          step.runId,
          step.stepId,
          step.attempt,
        ],
      )) as { rows: { status: RunStepLogEntry['status'] }[] };

      assertRunStepTransitionAllowed({
        ...(previousResult.rows[0]?.status ? { previousStatus: previousResult.rows[0].status } : {}),
        nextStatus: step.status,
        runId: step.runId,
        stepId: step.stepId,
        attempt: step.attempt,
        evidenceId: step.id,
      });

      await client.query(
        `INSERT INTO ${this.table('run_step_log')} (
          id, org_id, project_id, run_id, tenant_id, project_scope_id, step_id, attempt, task_id, role, tool, input_text, output_text, status, policy_decision_id, idempotency_key, payload_ref, checksum, prev_checksum, trace_id, duration_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          step.id,
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          step.runId,
          step.tenantId,
          step.projectId,
          step.stepId,
          step.attempt,
          step.taskId ?? null,
          step.role,
          step.tool ?? null,
          step.input,
          step.output,
          step.status,
          step.policyDecisionId ?? null,
          step.idempotencyKey,
          step.payloadRef ?? null,
          step.checksum,
          step.prevChecksum ?? null,
          step.traceId,
          step.durationMs,
          step.createdAt,
        ],
      );
      return await this.lockAndLoadCurrentSnapshotRevision(client);
    });
    return { revision };
  }

  async markTaskDone(
    taskId: string,
    summary: string,
    options: StateWriteOptions = {},
  ): Promise<StateMutationResult> {
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
    const revision = await this.withTransaction(async (client) => {
      await this.insertEvent(client, event);
      return await this.insertSnapshot(client, current, options.expectedRevision != null ? options : {
        expectedRevision: current.revision,
      });
    });
    return { revision };
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

  private async insertSnapshot(
    client: PgClientLike,
    state: ProjectState,
    options: StateWriteOptions = {},
  ): Promise<number> {
    assertProjectState(state);
    const expectedRevision = expectedRevisionFor(state, options);
    const currentRevision = await this.lockAndLoadCurrentSnapshotRevision(client);
    if (expectedRevision !== currentRevision) {
      throw stateRevisionConflict(expectedRevision, currentRevision);
    }

    const nextRevision = currentRevision + 1;
    const snapshot = structuredClone(state);
    snapshot.revision = nextRevision;
    assertProjectState(snapshot);

    try {
      await client.query(
        `INSERT INTO ${this.table('project_snapshots')} (id, org_id, project_id, revision, created_at, snapshot_json)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          crypto.randomUUID(),
          this.tenantScope.orgId,
          this.tenantScope.projectId,
          nextRevision,
          new Date().toISOString(),
          JSON.stringify(redactSecrets(snapshot)),
        ],
      );
      return nextRevision;
    } catch (error) {
      if (isPgUniqueViolation(error)) {
        throw stateRevisionConflict(expectedRevision, nextRevision);
      }
      throw error;
    }
  }

  private async lockAndLoadCurrentSnapshotRevision(client: PgClientLike): Promise<number> {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [this.tenantScope.orgId, this.tenantScope.projectId],
    );
    const result = (await client.query(
      `SELECT revision
       FROM ${this.table('project_snapshots')}
       WHERE org_id = $1 AND project_id = $2
       ORDER BY revision DESC, created_at DESC
       LIMIT 1`,
      [this.tenantScope.orgId, this.tenantScope.projectId],
    )) as { rows: { revision: string | number }[] };
    const revision = result.rows[0]?.revision;
    return revision == null ? 0 : Number(revision);
  }

  private async insertEvent(client: PgClientLike, event: DomainEvent): Promise<void> {
    await client.query(
      `INSERT INTO ${this.table('domain_events')} (
        id, org_id, project_id, event_type, created_at, run_id, payload_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.id,
        this.tenantScope.orgId,
        this.tenantScope.projectId,
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
      if (error instanceof StateStoreError) {
        throw error;
      }
      throw new StateStoreError('PostgreSQL state transaction failed', { cause: error });
    } finally {
      client.release();
    }
  }
}

async function loadPgPool(connectionString: string): Promise<PgPoolLike> {
  try {
    const pgModule = asPgModule(await importOptionalModule('pg'));
    return new pgModule.Pool({ connectionString });
  } catch (error) {
    throw new StateStoreError(
      'PostgreSQL backend requires the "pg" package to be installed and resolvable at runtime',
      { cause: error },
    );
  }
}

async function importOptionalModule(moduleName: string): Promise<unknown> {
  return await import(moduleName);
}

function asPgModule(module: unknown): PgModule {
  if (isRecord(module) && typeof module.Pool === 'function') {
    return module as unknown as PgModule;
  }
  throw new StateStoreError('PostgreSQL backend loaded an invalid "pg" module');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPgUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === '23505';
}
