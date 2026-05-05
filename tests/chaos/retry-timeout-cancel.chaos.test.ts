import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWithRetry } from '../../packages/execution/src/retry/execute-with-retry.ts';

void test('chaos: executeWithRetry stops immediately when parent signal already aborted', async () => {
  const controller = new AbortController();
  controller.abort();

  const result = await executeWithRetry({
    signal: controller.signal,
    execute: async () => ({ ok: true, value: 'unexpected' }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'RETRY_CANCELLED');
});

void test('chaos: executeWithRetry cancels during backoff without extra attempts', async () => {
  const controller = new AbortController();
  let executeCalls = 0;

  const resultPromise = executeWithRetry({
    signal: controller.signal,
    policy: { maxAttempts: 5, baseDelayMs: 5, maxDelayMs: 5, jitterRatio: 0, backoffMultiplier: 1 },
    execute: async () => {
      executeCalls += 1;
      return { ok: false, failure: { code: 'TEMP', message: 'retry me', retriable: true } };
    },
    sleep: async () => {
      controller.abort();
      throw new Error('sleep_aborted');
    },
  });

  const result = await resultPromise;

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'RETRY_CANCELLED');
  assert.equal(executeCalls, 1);
});

void test('chaos: executeWithRetry does not retry non-retriable failure', async () => {
  let executeCalls = 0;

  const result = await executeWithRetry({
    policy: { maxAttempts: 10, baseDelayMs: 1, maxDelayMs: 1, jitterRatio: 0, backoffMultiplier: 1 },
    execute: async () => {
      executeCalls += 1;
      return { ok: false, failure: { code: 'PERM', message: 'fatal', retriable: false } };
    },
    sleep: async () => {
      throw new Error('sleep should not be called');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'PERM');
  assert.equal(executeCalls, 1);
});
