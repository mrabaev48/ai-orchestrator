import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainEvent } from '@ai-orchestrator/core';
import { buildSliSnapshotFromEvents, type TelemetrySpanRecord } from '@ai-orchestrator/state';

function event(eventType: DomainEvent['eventType'], payload: Record<string, unknown>): DomainEvent {
  return {
    id: `${eventType}-id`,
    eventType,
    payload,
    createdAt: '2026-05-02T00:00:00.000Z',
  };
}

test('buildSliSnapshotFromEvents computes rates and p95 latency', () => {
  const events: DomainEvent[] = [
    event('TASK_COMPLETED', {}),
    event('TASK_BLOCKED', { code: 'STEP_TIMEOUT' }),
    event('TASK_BLOCKED', { code: 'STEP_CANCELLED' }),
  ];
  const spans: TelemetrySpanRecord[] = [
    span(100),
    span(300),
    span(200),
  ];

  const snapshot = buildSliSnapshotFromEvents(events, spans);
  assert.equal(snapshot.sampleSize, 3);
  assert.equal(Math.round(snapshot.successRatePercent), 33);
  assert.equal(Math.round(snapshot.timeoutRatePercent), 33);
  assert.equal(Math.round(snapshot.cancellationRatePercent), 33);
  assert.equal(snapshot.p95LatencyMs, 300);
});

function span(durationMs: number): TelemetrySpanRecord {
  return {
    id: `span-${durationMs}`,
    spanName: 'task_run',
    durationMs,
    status: 'ok',
    tags: {},
    createdAt: '2026-05-02T00:00:00.000Z',
  };
}

test('buildSliSnapshotFromEvents is deterministic on empty terminal data', () => {
  const snapshot = buildSliSnapshotFromEvents([]);
  assert.equal(snapshot.sampleSize, 0);
  assert.equal(snapshot.successRatePercent, 0);
  assert.equal(snapshot.p95LatencyMs, 0);
});
