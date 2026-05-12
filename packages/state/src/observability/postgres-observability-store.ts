import { redactSecrets, StateStoreError } from '@ai-orchestrator/shared';
import {
  createTelemetryExpiresAt,
  type ListTelemetryMetricsQuery,
  type ListTelemetrySpansQuery,
  type ObservabilityRetentionPolicy,
  type ObservabilityStore,
  type RecordTelemetryMetricInput,
  type RecordTelemetrySpanInput,
  type TelemetryMetricRecord,
  type TelemetryMetricType,
  type TelemetrySpanRecord,
  type TelemetrySpanStatus,
} from './observability-store.js';
import {
  loadPgPool,
  quotePostgresIdentifier,
  type PgPoolLike,
} from '../postgres/pg.js';

export interface PostgresObservabilityStoreOptions extends ObservabilityRetentionPolicy {
  readonly schema?: string;
  readonly orgId: string;
  readonly projectId: string;
}

type SqlParam = string | number | null;

export class PostgresObservabilityStore implements ObservabilityStore {
  private readonly poolPromise: Promise<PgPoolLike>;
  private readonly schema: string;
  private readonly orgId: string;
  private readonly projectId: string;
  private readonly retentionDays: number | undefined;

  constructor(connectionString: string, options: PostgresObservabilityStoreOptions) {
    this.poolPromise = loadPgPool(connectionString);
    this.schema = options.schema ?? 'public';
    this.orgId = options.orgId;
    this.projectId = options.projectId;
    this.retentionDays = options.retentionDays;
  }

  async recordMetric(input: RecordTelemetryMetricInput): Promise<TelemetryMetricRecord> {
    const pool = await this.poolPromise;
    const record = buildMetricRecord(input, this.retentionDays);
    await pool.query(
      `INSERT INTO ${this.table('telemetry_metrics')} (
        id, org_id, project_id, run_id, correlation_id, name, metric_type, value, tags_json, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
      [
        record.id,
        this.orgId,
        this.projectId,
        record.runId ?? null,
        record.correlationId ?? null,
        record.name,
        record.metricType,
        record.value,
        JSON.stringify(redactSecrets(record.tags)),
        record.createdAt,
        record.expiresAt ?? null,
      ],
    );
    return record;
  }

  async recordSpan(input: RecordTelemetrySpanInput): Promise<TelemetrySpanRecord> {
    const pool = await this.poolPromise;
    const record = buildSpanRecord(input, this.retentionDays);
    await pool.query(
      `INSERT INTO ${this.table('telemetry_spans')} (
        id, org_id, project_id, run_id, correlation_id, span_name, duration_ms, status,
        task_id, role, tool_name, tags_json, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
      [
        record.id,
        this.orgId,
        this.projectId,
        record.runId ?? null,
        record.correlationId ?? null,
        record.spanName,
        record.durationMs,
        record.status,
        record.taskId ?? null,
        record.role ?? null,
        record.toolName ?? null,
        JSON.stringify(redactSecrets(record.tags)),
        record.createdAt,
        record.expiresAt ?? null,
      ],
    );
    return record;
  }

  async listMetrics(query: ListTelemetryMetricsQuery = {}): Promise<TelemetryMetricRecord[]> {
    const pool = await this.poolPromise;
    const clauses = this.baseTenantClauses();
    const params: SqlParam[] = [this.orgId, this.projectId];

    if (query.runId) {
      clauses.push(`run_id = $${params.length + 1}`);
      params.push(query.runId);
    }
    if (query.correlationId) {
      clauses.push(`correlation_id = $${params.length + 1}`);
      params.push(query.correlationId);
    }
    if (query.name) {
      clauses.push(`name = $${params.length + 1}`);
      params.push(query.name);
    }
    if (query.metricType) {
      clauses.push(`metric_type = $${params.length + 1}`);
      params.push(query.metricType);
    }

    const paginationClause = appendPagination(params, query.limit, query.offset);
    const result = await pool.query<TelemetryMetricRow>(
      `SELECT id, run_id, correlation_id, name, metric_type, value, tags_json, created_at, expires_at
       FROM ${this.table('telemetry_metrics')}
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       ${paginationClause}`,
      params,
    );

    return result.rows.map(mapMetricRow);
  }

  async listSpans(query: ListTelemetrySpansQuery = {}): Promise<TelemetrySpanRecord[]> {
    const pool = await this.poolPromise;
    const clauses = this.baseTenantClauses();
    const params: SqlParam[] = [this.orgId, this.projectId];

    if (query.runId) {
      clauses.push(`run_id = $${params.length + 1}`);
      params.push(query.runId);
    }
    if (query.correlationId) {
      clauses.push(`correlation_id = $${params.length + 1}`);
      params.push(query.correlationId);
    }
    if (query.taskId) {
      clauses.push(`task_id = $${params.length + 1}`);
      params.push(query.taskId);
    }
    if (query.role) {
      clauses.push(`role = $${params.length + 1}`);
      params.push(query.role);
    }
    if (query.toolName) {
      clauses.push(`tool_name = $${params.length + 1}`);
      params.push(query.toolName);
    }
    if (query.status) {
      clauses.push(`status = $${params.length + 1}`);
      params.push(query.status);
    }

    const paginationClause = appendPagination(params, query.limit, query.offset);
    const result = await pool.query<TelemetrySpanRow>(
      `SELECT id, run_id, correlation_id, span_name, duration_ms, status, task_id, role, tool_name,
              tags_json, created_at, expires_at
       FROM ${this.table('telemetry_spans')}
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       ${paginationClause}`,
      params,
    );

    return result.rows.map(mapSpanRow);
  }

  async purgeExpired(nowIso: string = new Date().toISOString()): Promise<number> {
    const pool = await this.poolPromise;
    const metricResult = await pool.query<PurgedCountRow>(
      `DELETE FROM ${this.table('telemetry_metrics')}
       WHERE org_id = $1 AND project_id = $2 AND expires_at IS NOT NULL AND expires_at <= $3
       RETURNING id`,
      [this.orgId, this.projectId, nowIso],
    );
    const spanResult = await pool.query<PurgedCountRow>(
      `DELETE FROM ${this.table('telemetry_spans')}
       WHERE org_id = $1 AND project_id = $2 AND expires_at IS NOT NULL AND expires_at <= $3
       RETURNING id`,
      [this.orgId, this.projectId, nowIso],
    );
    return metricResult.rows.length + spanResult.rows.length;
  }

  private baseTenantClauses(): string[] {
    return ['org_id = $1', 'project_id = $2'];
  }

  private table(name: string): string {
    return `${quotePostgresIdentifier(this.schema)}.${quotePostgresIdentifier(name)}`;
  }
}

interface TelemetryMetricRow extends Record<string, unknown> {
  readonly id: string;
  readonly run_id: string | null;
  readonly correlation_id: string | null;
  readonly name: string;
  readonly metric_type: TelemetryMetricType;
  readonly value: number | string;
  readonly tags_json: Record<string, string>;
  readonly created_at: string;
  readonly expires_at: string | null;
}

interface TelemetrySpanRow extends Record<string, unknown> {
  readonly id: string;
  readonly run_id: string | null;
  readonly correlation_id: string | null;
  readonly span_name: string;
  readonly duration_ms: number;
  readonly status: TelemetrySpanStatus;
  readonly task_id: string | null;
  readonly role: string | null;
  readonly tool_name: string | null;
  readonly tags_json: Record<string, string>;
  readonly created_at: string;
  readonly expires_at: string | null;
}

interface PurgedCountRow extends Record<string, unknown> {
  readonly id: string;
}

function buildMetricRecord(input: RecordTelemetryMetricInput, retentionDays?: number): TelemetryMetricRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const expiresAt = createTelemetryExpiresAt(createdAt, retentionDays);
  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    metricType: input.metricType,
    value: input.value,
    tags: structuredClone(input.tags),
    createdAt,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function buildSpanRecord(input: RecordTelemetrySpanInput, retentionDays?: number): TelemetrySpanRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const expiresAt = createTelemetryExpiresAt(createdAt, retentionDays);
  return {
    id: input.id ?? crypto.randomUUID(),
    spanName: input.spanName,
    durationMs: input.durationMs,
    status: input.status,
    tags: structuredClone(input.tags),
    createdAt,
    ...(input.runId ? { runId: input.runId } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.toolName ? { toolName: input.toolName } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function appendPagination(params: SqlParam[], limit?: number, offset?: number): string {
  const clauses: string[] = [];
  if (limit !== undefined) {
    params.push(limit);
    clauses.push(`LIMIT $${params.length}`);
  }
  if (offset !== undefined) {
    params.push(offset);
    clauses.push(`OFFSET $${params.length}`);
  }
  return clauses.join('\n');
}

function mapMetricRow(row: TelemetryMetricRow): TelemetryMetricRecord {
  return {
    id: row.id,
    name: row.name,
    metricType: row.metric_type,
    value: Number(row.value),
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
  };
}

function mapSpanRow(row: TelemetrySpanRow): TelemetrySpanRecord {
  return {
    id: row.id,
    spanName: row.span_name,
    durationMs: row.duration_ms,
    status: row.status,
    tags: parseTags(row.tags_json),
    createdAt: row.created_at,
    ...(row.run_id ? { runId: row.run_id } : {}),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
    ...(row.task_id ? { taskId: row.task_id } : {}),
    ...(row.role ? { role: row.role } : {}),
    ...(row.tool_name ? { toolName: row.tool_name } : {}),
    ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
  };
}

function parseTags(value: Record<string, string>): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string') {
      throw new StateStoreError('Telemetry tags must be stored as string values');
    }
    tags[key] = item;
  }
  return tags;
}
