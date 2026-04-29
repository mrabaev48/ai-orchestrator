import type { Logger } from '../../../packages/shared/src/index.ts';

export interface WorkerRunnerOptions {
  pollIntervalMs: number;
  idleBackoffMs: number;
}

export interface WorkerOrchestrator {
  runCycle: () => Promise<{ status: 'completed' | 'blocked' | 'idle'; taskId?: string }>; 
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
      data: {
        pollIntervalMs: this.options.pollIntervalMs,
        idleBackoffMs: this.options.idleBackoffMs,
      },
    });

    while (!this.stopRequested) {
      const result = await this.orchestrator.runCycle();
      const hasWork = result.status !== 'idle' || typeof result.taskId === 'string';

      if (!hasWork) {
        await sleep(this.options.idleBackoffMs);
        continue;
      }

      await sleep(this.options.pollIntervalMs);
    }

    this.logger.info('workflow worker stopped');
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
