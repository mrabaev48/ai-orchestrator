import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSlo, DEFAULT_AUTONOMOUS_SLO_POLICY } from '../packages/application/src/slo/slo-policy.ts';

test('assessSlo returns healthy verdict for passing snapshot', () => {
  const result = assessSlo({
    successRatePercent: 99.5,
    timeoutRatePercent: 0.2,
    cancellationRatePercent: 0.1,
    p95LatencyMs: 1000,
    sampleSize: 100,
  });

  assert.equal(result.verdict, 'healthy');
  assert.equal(result.criteria.every((item) => item.status === 'pass'), true);
  assert.equal(result.policyId, DEFAULT_AUTONOMOUS_SLO_POLICY.id);
});

test('assessSlo returns at_risk verdict and exhausted budget when success rate drops', () => {
  const result = assessSlo({
    successRatePercent: 95,
    timeoutRatePercent: 3,
    cancellationRatePercent: 3,
    p95LatencyMs: 200000,
    sampleSize: 20,
  });

  assert.equal(result.verdict, 'at_risk');
  assert.equal(result.errorBudget.status, 'exhausted');
});
