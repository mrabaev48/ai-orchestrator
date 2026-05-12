import type { Logger } from '@ai-orchestrator/shared';
import type { ObservabilityStore, TelemetryMetricType, TelemetrySpanStatus } from '@ai-orchestrator/state';

export interface CounterMetricInput {
  name: string;
  value?: number;
  runId?: string;
  correlationId?: string;
  tags?: Record<string, string>;
}

export interface SpanMetricInput {
  spanName: string;
  durationMs: number;
  status: TelemetrySpanStatus;
  runId?: string;
  correlationId?: string;
  taskId?: string;
  role?: string;
  toolName?: string;
  tags?: Record<string, string>;
}

export interface ExecutionTelemetry {
  incrementCounter: (input: CounterMetricInput) => Promise<void>;
  recordHistogram: (input: CounterMetricInput) => Promise<void>;
  recordSpan: (input: SpanMetricInput) => Promise<void>;
}

export class ObservabilityStoreExecutionTelemetry implements ExecutionTelemetry {
  private readonly observabilityStore: ObservabilityStore;
  private readonly logger: Logger;

  constructor(observabilityStore: ObservabilityStore, logger: Logger) {
    this.observabilityStore = observabilityStore;
    this.logger = logger;
  }

  async incrementCounter(input: CounterMetricInput): Promise<void> {
    await this.recordMetric('counter', input);
  }

  async recordHistogram(input: CounterMetricInput): Promise<void> {
    await this.recordMetric('histogram', input);
  }

  async recordSpan(input: SpanMetricInput): Promise<void> {
    try {
      await this.observabilityStore.recordSpan({
        spanName: input.spanName,
        durationMs: input.durationMs,
        status: input.status,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.correlationId ?? input.runId ? { correlationId: input.correlationId ?? input.runId } : {}),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
        tags: {
          ...(input.tags ?? {}),
          ...(input.runId ? { runId: input.runId } : {}),
          ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        },
      });
    } catch {
      this.logger.warn('Unable to persist telemetry span', {
        event: 'telemetry_span_record_failed',
        ...(input.runId ? { runId: input.runId } : {}),
        data: {
          spanName: input.spanName,
          durationMs: input.durationMs,
          status: input.status,
          tags: input.tags ?? {},
        },
      });
    }
  }

  private async recordMetric(metricType: TelemetryMetricType, input: CounterMetricInput): Promise<void> {
    const metricValue = input.value ?? 1;
    try {
      await this.observabilityStore.recordMetric({
        metricType,
        name: input.name,
        value: metricValue,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.correlationId ?? input.runId ? { correlationId: input.correlationId ?? input.runId } : {}),
        tags: {
          ...(input.tags ?? {}),
          ...(input.runId ? { runId: input.runId } : {}),
          ...(input.correlationId ? { correlationId: input.correlationId } : {}),
        },
      });
    } catch {
      this.logger.warn('Unable to persist telemetry metric', {
        event: 'telemetry_metric_record_failed',
        ...(input.runId ? { runId: input.runId } : {}),
        data: {
          metricType,
          metric: input.name,
          value: metricValue,
          tags: input.tags ?? {},
        },
      });
    }
  }
}
