import { test } from 'node:test';
import assert from 'node:assert/strict';

import { WorkerRunner } from '../apps/worker/src/worker-runner.ts';
import type { LogEntry, Logger } from '../packages/shared/src/index.ts';

class CapturedLogger implements Logger {
  readonly records: { level: string; message: string }[] = [];
  debug(message: string): void { this.records.push({ level: 'debug', message }); }
  info(message: string): void { this.records.push({ level: 'info', message }); }
  warn(message: string): void { this.records.push({ level: 'warn', message }); }
  error(message: string): void { this.records.push({ level: 'error', message }); }
  withContext(context: Partial<LogEntry>): Logger {
    void context;
    return this;
  }
}

const options = {
  pollIntervalMs: 1,
  idleBackoffMs: 1,
  maxIdleBackoffMs: 4,
  cycleTimeoutMs: 50,
  errorBackoffMs: 1,
  maxErrorBackoffMs: 4,
};

test('WorkerRunner stops after stop signal and executes cycles', async () => {
  const logger = new CapturedLogger();
  let runCycleCalls = 0;

  const runner = new WorkerRunner({
    runCycle: async () => {
      runCycleCalls += 1;
      if (runCycleCalls === 2) {
        runner.requestStop();
      }
      return runCycleCalls === 1 ? { status: 'completed' as const, taskId: 'task-1' } : { status: 'idle' as const };
    },
  }, logger, options);

  await runner.run();

  assert.equal(runCycleCalls, 2);
  assert.deepEqual(
    logger.records
      .filter((entry) => entry.level === 'info')
      .map((entry) => entry.message),
    ['workflow worker started', 'workflow worker stopped'],
  );
});

test('WorkerRunner retries after cycle failure and logs warning', async () => {
  const logger = new CapturedLogger();
  let runCycleCalls = 0;

  const runner = new WorkerRunner({
    runCycle: async () => {
      runCycleCalls += 1;
      if (runCycleCalls === 1) {
        throw new Error('transient');
      }
      runner.requestStop();
      return { status: 'idle' as const };
    },
  }, logger, options);

  await runner.run();

  assert.equal(runCycleCalls, 2);
  assert.equal(logger.records.some((entry) => entry.level === 'warn' && entry.message === 'workflow worker cycle failed'), true);
});

test('WorkerRunner forwards abort signal to orchestration cycle', async () => {
  let isAborted = false;

  const runner = new WorkerRunner({
    runCycle: async (input) => {
      input?.abortSignal?.addEventListener('abort', () => {
        isAborted = true;
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 30);
      });
      runner.requestStop();
      return { status: 'idle' as const };
    },
  }, new CapturedLogger(), {
    ...options,
    cycleTimeoutMs: 1,
  });

  await runner.run();

  assert.equal(isAborted, true);
});
