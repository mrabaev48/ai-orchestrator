import {
  createApplicationContext,
} from '../../../packages/application/src/index.ts';
import {
  ConfigError,
  createLogger,
  loadRuntimeConfig,
  OrchestratorError,
} from '../../../packages/shared/src/index.ts';
import { WorkerRunner } from './worker-runner.ts';

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_IDLE_BACKOFF_MS = 2_000;

async function main(): Promise<void> {
  const runtimeConfig = loadRuntimeConfig();
  const logger = createLogger(runtimeConfig);
  const args = parseArgs(process.argv.slice(2));

  const application = createApplicationContext({
    config: runtimeConfig,
    logger,
    initialStateInput: {
      projectId: args['project-id'] ?? 'ai-orchestrator',
      projectName: args['project-name'] ?? 'AI Orchestrator',
      summary: args.summary ?? 'MVP runtime state',
    },
  });

  const runner = new WorkerRunner(application.orchestrator, logger, {
    pollIntervalMs: parseInterval(args['poll-interval-ms'], DEFAULT_POLL_INTERVAL_MS, 'poll-interval-ms'),
    idleBackoffMs: parseInterval(args['idle-backoff-ms'], DEFAULT_IDLE_BACKOFF_MS, 'idle-backoff-ms'),
  });

  process.once('SIGINT', () => {
    runner.requestStop();
  });
  process.once('SIGTERM', () => {
    runner.requestStop();
  });

  await runner.run();
}

function parseInterval(raw: string | undefined, defaultValue: number, key: string): number {
  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ConfigError(`Invalid --${key} value. Expected a positive integer.`);
  }

  return parsed;
}

function parseArgs(argv: string[]): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part?.startsWith('--')) {
      continue;
    }

    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      entries[key] = 'true';
      continue;
    }

    entries[key] = next;
    index += 1;
  }
  return entries;
}

main().catch((error: unknown) => {
  const payload =
    error instanceof OrchestratorError
      ? error.toJSON()
      : {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        };

  console.error(JSON.stringify(payload));
  process.exitCode = error instanceof OrchestratorError ? error.exitCode : 1;
});
