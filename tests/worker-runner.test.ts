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
  }, logger, {
    pollIntervalMs: 1,
    idleBackoffMs: 1,
  });

  await runner.run();

  assert.equal(runCycleCalls, 2);
  assert.deepEqual(
    logger.records
      .filter((entry) => entry.level === 'info')
      .map((entry) => entry.message),
    ['workflow worker started', 'workflow worker stopped'],
  );
});
