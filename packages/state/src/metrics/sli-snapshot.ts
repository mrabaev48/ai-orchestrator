import type { DomainEvent } from '../../../core/src/index.ts';
import type { SliSnapshot } from '../../../application/src/slo/slo-policy.ts';

function percentile95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
}

export function buildSliSnapshotFromEvents(events: DomainEvent[]): SliSnapshot {
  const terminal = events.filter((event) => event.eventType === 'TASK_COMPLETED' || event.eventType === 'TASK_BLOCKED');
  const total = terminal.length;

  const successCount = terminal.filter((event) => event.eventType === 'TASK_COMPLETED').length;
  const timeouts = terminal.filter((event) => {
    const payload = event.payload as { code?: string };
    return payload.code === 'STEP_TIMEOUT';
  }).length;
  const cancellations = terminal.filter((event) => {
    const payload = event.payload as { code?: string };
    return payload.code === 'STEP_CANCELLED';
  }).length;

  const latencies = events
    .filter((event) => event.eventType === 'METRIC_RECORDED')
    .map((event) => {
      const payload = event.payload as { name?: string; value?: number };
      if (payload.name !== 'span_task_duration_ms' || typeof payload.value !== 'number') {
        return null;
      }
      return payload.value;
    })
    .filter((value): value is number => value !== null);

  const denominator = total === 0 ? 1 : total;
  return {
    successRatePercent: (successCount / denominator) * 100,
    timeoutRatePercent: (timeouts / denominator) * 100,
    cancellationRatePercent: (cancellations / denominator) * 100,
    p95LatencyMs: percentile95(latencies),
    sampleSize: total,
  };
}
