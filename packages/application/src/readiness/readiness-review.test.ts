import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateProductionReadinessReview } from './readiness-review.ts';

void test('ReadinessReview: returns not_ready when a blocker check fails', () => {
  const result = evaluateProductionReadinessReview({
    runId: 'run-44',
    reviewDateIso: '2026-05-05T00:00:00.000Z',
    checks: [
      {
        id: 'lint',
        title: 'Lint gate',
        severity: 'blocker',
        passed: false,
        details: 'lint failed in package execution',
      },
      {
        id: 'docs',
        title: 'Docs updated',
        severity: 'warning',
        passed: true,
        details: 'docs current',
      },
    ],
  });

  assert.equal(result.verdict, 'not_ready');
  assert.equal(result.blockers.length, 1);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(result.evidence, {
    totalChecks: 2,
    passedChecks: 1,
    failedChecks: 1,
    blockerCount: 1,
    warningCount: 0,
  });
});

void test('ReadinessReview: returns ready when only warning checks fail', () => {
  const result = evaluateProductionReadinessReview({
    runId: 'run-44',
    reviewDateIso: '2026-05-05T00:00:00.000Z',
    checks: [
      {
        id: 'observability',
        title: 'Observability completeness',
        severity: 'warning',
        passed: false,
        details: 'one optional metric stream missing',
      },
    ],
  });

  assert.equal(result.verdict, 'ready');
  assert.equal(result.blockers.length, 0);
  assert.deepEqual(result.warnings, [
    {
      checkId: 'observability',
      title: 'Observability completeness',
      details: 'one optional metric stream missing',
    },
  ]);
});

void test('ReadinessReview: is deterministic for same input payload', () => {
  const input = {
    runId: 'run-deterministic',
    reviewDateIso: '2026-05-05T00:00:00.000Z',
    checks: [
      {
        id: 'typecheck',
        title: 'Typecheck gate',
        severity: 'blocker' as const,
        passed: true,
        details: 'ok',
      },
    ],
  };

  assert.deepEqual(
    evaluateProductionReadinessReview(input),
    evaluateProductionReadinessReview(input),
  );
});
