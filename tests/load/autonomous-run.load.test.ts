import test from 'node:test';
import assert from 'node:assert/strict';

import { executeWithRetry } from '../../packages/execution/src/retry/execute-with-retry.ts';
import { resumeFromCheckpoint } from '../../packages/execution/src/recovery/resume-from-checkpoint.ts';
import type { RecoveryCheckpoint, RecoveryCheckpointStore } from '../../packages/state/src/recovery/recovery-checkpoint.store.ts';
import type { RunStepLogEntry } from '../../packages/core/src/index.ts';

class InMemoryCheckpointStore implements RecoveryCheckpointStore {
  readonly checkpoints = new Map<string, RecoveryCheckpoint>();

  async persist(entry: RunStepLogEntry): Promise<RecoveryCheckpoint | null> {
    if (!entry.taskId || (entry.status !== 'failed' && entry.status !== 'timed_out' && entry.status !== 'cancelled')) {
      return null;
    }
    const checkpoint: RecoveryCheckpoint = {
      taskId: entry.taskId,
      runId: entry.runId,
      stepId: entry.stepId,
      attempt: entry.attempt,
      idempotencyKey: entry.idempotencyKey,
      traceId: entry.traceId,
      createdAt: entry.createdAt,
      reason: entry.status,
    };
    this.checkpoints.set(entry.taskId, checkpoint);
    return checkpoint;
  }

  async getLatestByTaskId(taskId: string): Promise<RecoveryCheckpoint | null> {
    return this.checkpoints.get(taskId) ?? null;
  }

  async upsert(checkpoint: RecoveryCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.taskId, checkpoint);
  }
}

void test('load: retry loop remains deterministic under repeated transient failures', async () => {
  const tasks = 120;
  const outcomes = await Promise.all(
    Array.from({ length: tasks }, async (_v, index) => {
      let attempts = 0;
      const result = await executeWithRetry({
        policy: { maxAttempts: 3, baseDelayMs: 0, maxDelayMs: 0, jitterRatio: 0, backoffMultiplier: 1 },
        execute: async () => {
          attempts += 1;
          if (attempts < 3) {
            return { ok: false, failure: { code: 'TEMP', message: `transient-${index}`, retriable: true } };
          }
          return { ok: true, value: { index, attempts } };
        },
      });
      return { result, attempts };
    }),
  );

  assert.equal(outcomes.length, tasks);
  for (const outcome of outcomes) {
    assert.equal(outcome.result.ok, true);
    assert.equal(outcome.attempts, 3);
  }
});

void test('load: resumeFromCheckpoint returns isolated deterministic pointers for many tasks', async () => {
  const store = new InMemoryCheckpointStore();
  const taskCount = 200;

  for (let i = 0; i < taskCount; i += 1) {
    await store.upsert({
      taskId: `task-${i}`,
      runId: `run-${i}`,
      stepId: `step-${i}`,
      attempt: i % 4,
      traceId: `trace-${i}`,
      idempotencyKey: `idem-${i}`,
      createdAt: new Date().toISOString(),
      reason: 'failed',
    });
  }

  const pointers = await Promise.all(
    Array.from({ length: taskCount }, async (_v, i) =>
      resumeFromCheckpoint(store, {
        taskId: `task-${i}`,
        requestedBy: 'load-suite',
        reason: 'recovery-drill',
      }),
    ),
  );

  assert.equal(pointers.length, taskCount);
  for (let i = 0; i < pointers.length; i += 1) {
    assert.equal(pointers[i]?.runId, `run-${i}`);
    assert.equal(pointers[i]?.stepId, `step-${i}`);
    assert.equal(pointers[i]?.traceId, `trace-${i}`);
    assert.equal(pointers[i]?.nextAttempt, (i % 4) + 1);
    assert.equal(pointers[i]?.idempotencyKey, `idem-${i}:resume:${(i % 4) + 1}`);
  }
});
