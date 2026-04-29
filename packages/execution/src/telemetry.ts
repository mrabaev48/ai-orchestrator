import { makeEvent } from '../../core/src/index.ts';
import type { Logger } from '../../shared/src/index.ts';
import type { StateStore } from '../../state/src/index.ts';

export interface CounterMetricInput {
  name: string;
  value?: number;
  runId?: string;
  tags?: Record<string, string>;
}

export interface ExecutionTelemetry {
  incrementCounter: (input: CounterMetricInput) => Promise<void>;
  recordHistogram: (input: CounterMetricInput) => Promise<void>;
}

export class StateStoreExecutionTelemetry implements ExecutionTelemetry {
  private readonly stateStore: StateStore;
  private readonly logger: Logger;

  constructor(stateStore: StateStore, logger: Logger) {
    this.stateStore = stateStore;
    this.logger = logger;
  }

  async incrementCounter(input: CounterMetricInput): Promise<void> {
    await this.recordMetric('counter', input);
  }

  async recordHistogram(input: CounterMetricInput): Promise<void> {
    await this.recordMetric('histogram', input);
  }

  private async recordMetric(metricType: 'counter' | 'histogram', input: CounterMetricInput): Promise<void> {
    const metricValue = input.value ?? 1;
    const metricEvent = makeEvent(
      'METRIC_RECORDED',
      {
        metricType,
        name: input.name,
        value: metricValue,
        tags: input.tags ?? {},
      },
      input.runId ? { runId: input.runId } : {},
    );

    try {
      await this.stateStore.recordEvent(metricEvent);
    } catch {
      this.logger.warn('Unable to persist telemetry metric event', {
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
