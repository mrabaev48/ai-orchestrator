import {
  createTelemetryExpiresAt,
  type ListTelemetryMetricsQuery,
  type ListTelemetrySpansQuery,
  type ObservabilityRetentionPolicy,
  type ObservabilityStore,
  type RecordTelemetryMetricInput,
  type RecordTelemetrySpanInput,
  type TelemetryMetricRecord,
  type TelemetrySpanRecord,
} from './observability-store.js';

export class InMemoryObservabilityStore implements ObservabilityStore {
  readonly metrics: TelemetryMetricRecord[] = [];
  readonly spans: TelemetrySpanRecord[] = [];
  private readonly retentionDays: number | undefined;

  constructor(retentionPolicy: ObservabilityRetentionPolicy = {}) {
    this.retentionDays = retentionPolicy.retentionDays;
  }

  async recordMetric(input: RecordTelemetryMetricInput): Promise<TelemetryMetricRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const record: TelemetryMetricRecord = {
      id: input.id ?? crypto.randomUUID(),
      name: input.name,
      metricType: input.metricType,
      value: input.value,
      tags: structuredClone(input.tags),
      createdAt,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...withOptionalExpiresAt(createdAt, this.retentionDays),
    };
    this.metrics.push(structuredClone(record));
    return structuredClone(record);
  }

  async recordSpan(input: RecordTelemetrySpanInput): Promise<TelemetrySpanRecord> {
    const createdAt = input.createdAt ?? new Date().toISOString();
    const record: TelemetrySpanRecord = {
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
      ...withOptionalExpiresAt(createdAt, this.retentionDays),
    };
    this.spans.push(structuredClone(record));
    return structuredClone(record);
  }

  async listMetrics(query: ListTelemetryMetricsQuery = {}): Promise<TelemetryMetricRecord[]> {
    return structuredClone(
      applyPagination(
        this.metrics
          .filter((record) => matchesMetricQuery(record, query))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        query.offset,
        query.limit,
      ),
    );
  }

  async listSpans(query: ListTelemetrySpansQuery = {}): Promise<TelemetrySpanRecord[]> {
    return structuredClone(
      applyPagination(
        this.spans
          .filter((record) => matchesSpanQuery(record, query))
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
        query.offset,
        query.limit,
      ),
    );
  }

  async purgeExpired(nowIso: string = new Date().toISOString()): Promise<number> {
    const nowMs = Date.parse(nowIso);
    const metricCountBefore = this.metrics.length;
    const spanCountBefore = this.spans.length;

    removeExpiredRecords(this.metrics, nowMs);
    removeExpiredRecords(this.spans, nowMs);

    return metricCountBefore + spanCountBefore - this.metrics.length - this.spans.length;
  }
}

function withOptionalExpiresAt(createdAt: string, retentionDays?: number): { expiresAt?: string } {
  const expiresAt = createTelemetryExpiresAt(createdAt, retentionDays);
  return expiresAt ? { expiresAt } : {};
}

function matchesMetricQuery(record: TelemetryMetricRecord, query: ListTelemetryMetricsQuery): boolean {
  if (query.runId && record.runId !== query.runId) {
    return false;
  }
  if (query.correlationId && record.correlationId !== query.correlationId) {
    return false;
  }
  if (query.name && record.name !== query.name) {
    return false;
  }
  if (query.metricType && record.metricType !== query.metricType) {
    return false;
  }
  return true;
}

function matchesSpanQuery(record: TelemetrySpanRecord, query: ListTelemetrySpansQuery): boolean {
  if (query.runId && record.runId !== query.runId) {
    return false;
  }
  if (query.correlationId && record.correlationId !== query.correlationId) {
    return false;
  }
  if (query.taskId && record.taskId !== query.taskId) {
    return false;
  }
  if (query.role && record.role !== query.role) {
    return false;
  }
  if (query.toolName && record.toolName !== query.toolName) {
    return false;
  }
  if (query.status && record.status !== query.status) {
    return false;
  }
  return true;
}

function applyPagination<TRecord>(records: TRecord[], offset = 0, limit?: number): TRecord[] {
  return limit === undefined ? records.slice(offset) : records.slice(offset, offset + limit);
}

function removeExpiredRecords(records: { expiresAt?: string }[], nowMs: number): void {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const expiresAt = records[index]?.expiresAt;
    if (expiresAt && Date.parse(expiresAt) <= nowMs) {
      records.splice(index, 1);
    }
  }
}
