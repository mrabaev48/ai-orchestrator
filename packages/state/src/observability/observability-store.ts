export type TelemetryMetricType = 'counter' | 'histogram' | 'gauge';
export type TelemetrySpanStatus = 'ok' | 'error';

export interface ObservabilityRetentionPolicy {
  readonly retentionDays?: number;
}

export interface TelemetryMetricRecord {
  readonly id: string;
  readonly name: string;
  readonly metricType: TelemetryMetricType;
  readonly value: number;
  readonly tags: Record<string, string>;
  readonly createdAt: string;
  readonly runId?: string;
  readonly correlationId?: string;
  readonly expiresAt?: string;
}

export interface TelemetrySpanRecord {
  readonly id: string;
  readonly spanName: string;
  readonly durationMs: number;
  readonly status: TelemetrySpanStatus;
  readonly tags: Record<string, string>;
  readonly createdAt: string;
  readonly runId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly role?: string;
  readonly toolName?: string;
  readonly expiresAt?: string;
}

export type RecordTelemetryMetricInput = Omit<TelemetryMetricRecord, 'id' | 'createdAt' | 'expiresAt'> & {
  readonly id?: string;
  readonly createdAt?: string;
};

export type RecordTelemetrySpanInput = Omit<TelemetrySpanRecord, 'id' | 'createdAt' | 'expiresAt'> & {
  readonly id?: string;
  readonly createdAt?: string;
};

export interface ListTelemetryMetricsQuery {
  readonly limit?: number;
  readonly offset?: number;
  readonly runId?: string;
  readonly correlationId?: string;
  readonly name?: string;
  readonly metricType?: TelemetryMetricType;
}

export interface ListTelemetrySpansQuery {
  readonly limit?: number;
  readonly offset?: number;
  readonly runId?: string;
  readonly correlationId?: string;
  readonly taskId?: string;
  readonly role?: string;
  readonly toolName?: string;
  readonly status?: TelemetrySpanStatus;
}

export interface ObservabilityStore {
  recordMetric: (input: RecordTelemetryMetricInput) => Promise<TelemetryMetricRecord>;
  recordSpan: (input: RecordTelemetrySpanInput) => Promise<TelemetrySpanRecord>;
  listMetrics: (query?: ListTelemetryMetricsQuery) => Promise<TelemetryMetricRecord[]>;
  listSpans: (query?: ListTelemetrySpansQuery) => Promise<TelemetrySpanRecord[]>;
  purgeExpired: (nowIso?: string) => Promise<number>;
}

export function normalizeObservabilityRetentionDays(retentionDays?: number): number | undefined {
  if (retentionDays === undefined) {
    return undefined;
  }
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new Error(`Observability retentionDays must be a positive integer, received ${retentionDays}`);
  }
  return retentionDays;
}

export function createTelemetryExpiresAt(createdAt: string, retentionDays?: number): string | undefined {
  const normalizedRetentionDays = normalizeObservabilityRetentionDays(retentionDays);
  if (normalizedRetentionDays === undefined) {
    return undefined;
  }

  const createdAtTime = Date.parse(createdAt);
  if (!Number.isFinite(createdAtTime)) {
    throw new Error(`Telemetry createdAt must be an ISO timestamp, received ${createdAt}`);
  }

  return new Date(createdAtTime + normalizedRetentionDays * 24 * 60 * 60 * 1000).toISOString();
}
