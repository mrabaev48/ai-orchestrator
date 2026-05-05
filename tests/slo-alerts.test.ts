import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSloAlertBatch } from '../packages/application/src/slo/slo-alerts.ts';
import type { SloPolicy } from '../packages/application/src/slo/slo-policy.ts';

test('buildSloAlertBatch returns empty alerts for healthy snapshot', () => {
  const result = buildSloAlertBatch({
    successRatePercent: 99.9,
    timeoutRatePercent: 0.1,
    cancellationRatePercent: 0.1,
    p95LatencyMs: 500,
    sampleSize: 100,
  });

  assert.equal(result.assessment.verdict, 'healthy');
  assert.deepEqual(result.alerts, []);
});

test('buildSloAlertBatch returns criterion breach and budget exhausted alerts', () => {
  const result = buildSloAlertBatch({
    successRatePercent: 95,
    timeoutRatePercent: 2,
    cancellationRatePercent: 4,
    p95LatencyMs: 200000,
    sampleSize: 500,
  });

  assert.equal(result.assessment.verdict, 'at_risk');
  assert.equal(result.alerts.some((item) => item.incidentClass === 'success_rate_breach'), true);
  assert.equal(result.alerts.some((item) => item.incidentClass === 'timeout_rate_breach'), true);
  assert.equal(result.alerts.some((item) => item.incidentClass === 'cancellation_rate_breach'), true);
  assert.equal(result.alerts.some((item) => item.incidentClass === 'latency_breach'), true);
  assert.equal(result.alerts.some((item) => item.incidentClass === 'error_budget_exhausted'), true);
});

test('buildSloAlertBatch emits burn warning without criterion failures when custom budget is tighter', () => {
  const policy: SloPolicy = {
    id: 'custom-slo-policy',
    thresholds: {
      minSuccessRatePercent: 99,
      maxTimeoutRatePercent: 1,
      maxCancellationRatePercent: 2,
      maxP95LatencyMs: 120000,
    },
    errorBudget: {
      periodDays: 30,
      monthlyErrorBudgetPercent: 1,
      burnWarningThresholdPercent: 0.3,
    },
  };

  const result = buildSloAlertBatch(
    {
      successRatePercent: 99.6,
      timeoutRatePercent: 0.3,
      cancellationRatePercent: 0.2,
      p95LatencyMs: 1100,
      sampleSize: 300,
    },
    policy,
  );

  assert.equal(result.assessment.errorBudget.status, 'burn_warning');
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0]?.incidentClass, 'error_budget_burn_warning');
  assert.equal(result.alerts[0]?.severity, 'warning');
});
