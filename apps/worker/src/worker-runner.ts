import { setTimeout as sleepTimer } from 'node:timers/promises';

import type { Logger } from '../../../packages/shared/src/index.ts';

export interface WorkerRunnerOptions {
  pollIntervalMs: number;
  idleBackoffMs: number;
  maxIdleBackoffMs: number;
  cycleTimeoutMs: number;
  errorBackoffMs: number;
  maxErrorBackoffMs: number;
}

export interface WorkerOrchestrator {
  runCycle: (options?: { abortSignal?: AbortSignal }) => Promise<{ status: 'completed' | 'blocked' | 'idle'; taskId?: string }>;
}

export class WorkerRunner {
  private stopRequested = false;

  public constructor(
    private readonly orchestrator: WorkerOrchestrator,
    private readonly logger: Logger,
    private readonly options: WorkerRunnerOptions,
  ) {}

  requestStop(): void {
    this.stopRequested = true;
  }

  async run(): Promise<void> {
    this.logger.info('workflow worker started', {
      data: this.options,
    });

    let idleDelayMs = this.options.idleBackoffMs;
    let errorDelayMs = this.options.errorBackoffMs;

    while (!this.stopRequested) {
      try {
        const result = await this.runCycleWithTimeout();
        const hasWork = result.status !== 'idle' || typeof result.taskId === 'string';

        if (hasWork) {
          idleDelayMs = this.options.idleBackoffMs;
          errorDelayMs = this.options.errorBackoffMs;
          await this.sleepOrStop(this.options.pollIntervalMs);
          continue;
        }

        await this.sleepOrStop(idleDelayMs);
        idleDelayMs = Math.min(idleDelayMs * 2, this.options.maxIdleBackoffMs);
        errorDelayMs = this.options.errorBackoffMs;
      } catch (error) {
        this.logger.warn('workflow worker cycle failed', {
          data: {
            error,
            retryBackoffMs: errorDelayMs,
          },
        });
        await this.sleepOrStop(errorDelayMs);
        errorDelayMs = Math.min(errorDelayMs * 2, this.options.maxErrorBackoffMs);
      }
    }

    this.logger.info('workflow worker stopped');
  }

  private async runCycleWithTimeout(): Promise<{ status: 'completed' | 'blocked' | 'idle'; taskId?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.cycleTimeoutMs);

    try {
      return await this.orchestrator.runCycle({ abortSignal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sleepOrStop(ms: number): Promise<void> {
    if (ms <= 0 || this.stopRequested) {
      return;
    }

    await sleepTimer(ms);
  }
}
