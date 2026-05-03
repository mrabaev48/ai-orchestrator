import assert from 'node:assert/strict';
import test from 'node:test';
import { getRetrySchedule, resolveRetryPolicy } from '../packages/core/src/retry/retry-policy.ts';
import { executeWithRetry } from '../packages/execution/src/retry/execute-with-retry.ts';

test('retry policy: computes bounded exponential backoff with jitter', () => {
  const policy = resolveRetryPolicy({ maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 250, backoffMultiplier: 2, jitterRatio: 0.1 });

  const attempt1 = getRetrySchedule({ attempt: 1 }, policy, () => 1);
  const attempt2 = getRetrySchedule({ attempt: 2 }, policy, () => 0);
  const attempt3 = getRetrySchedule({ attempt: 3 }, policy, () => 0.5);
  const attempt4 = getRetrySchedule({ attempt: 4 }, policy, () => 0.5);

  assert.deepEqual(attempt1, { shouldRetry: true, delayMs: 110 });
  assert.deepEqual(attempt2, { shouldRetry: true, delayMs: 180 });
  assert.deepEqual(attempt3, { shouldRetry: true, delayMs: 250 });
  assert.deepEqual(attempt4, { shouldRetry: false, delayMs: 0 });
});

test('executeWithRetry: retries retriable failures and returns success', async () => {
  const attempts: number[] = [];
  const waits: number[] = [];

  const result = await executeWithRetry({
    policy: { maxAttempts: 3, baseDelayMs: 50, maxDelayMs: 100, backoffMultiplier: 2, jitterRatio: 0 },
    random: () => 0.5,
    sleep: async (ms) => {
      waits.push(ms);
    },
    execute: async ({ attempt }) => {
      attempts.push(attempt);
      if (attempt < 3) {
        return { ok: false, failure: { code: 'TEMP', message: 'temporary', retriable: true } };
      }
      return { ok: true, value: 'done' };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value, 'done');
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(waits, [50, 100]);
});

test('executeWithRetry: does not retry non-retriable failure', async () => {
  let attempts = 0;
  const result = await executeWithRetry({
    policy: { maxAttempts: 3 },
    execute: async () => {
      attempts += 1;
      return { ok: false, failure: { code: 'FATAL', message: 'fatal', retriable: false } };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(attempts, 1);
  assert.equal(result.failure?.code, 'FATAL');
});
