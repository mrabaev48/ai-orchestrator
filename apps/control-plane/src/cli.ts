import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  createLogger,
  loadRuntimeConfig,
  OrchestratorError,
  ConfigError,
} from '../../../packages/shared/src/index.ts';
import {
  createEmptyProjectState,
  makeEvent,
  type ProjectState,
} from '../../../packages/core/src/index.ts';
import {
  CoderRole,
  PromptEngineerRole,
  ReviewerRole,
  RoleRegistry,
  TaskManagerRole,
  TesterRole,
} from '../../../packages/agents/src/index.ts';
import { Orchestrator } from '../../../packages/execution/src/index.ts';
import {
  InMemoryStateStore,
  SqliteStateStore,
  type StateStore,
} from '../../../packages/state/src/index.ts';

type CommandName = 'bootstrap' | 'run-cycle' | 'show-state' | 'export-backlog';

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2) as [CommandName | undefined, ...string[]];
  if (!command) {
    throw new ConfigError('Missing command. Use bootstrap, show-state, or export-backlog.');
  }

  const runtimeConfig = loadRuntimeConfig();
  const logger = createLogger(runtimeConfig);
  const args = parseArgs(rest);
  const state = createEmptyProjectState({
    projectId: args['project-id'] ?? 'ai-orchestrator',
    projectName: args['project-name'] ?? 'AI Orchestrator',
    summary: args.summary ?? 'MVP runtime state',
  });
  const store = createStore(runtimeConfig.state.backend, runtimeConfig.state.sqlitePath, state);

  switch (command) {
    case 'bootstrap':
      await bootstrap(store, state, logger, runtimeConfig.state.snapshotOnBootstrap);
      return;
    case 'show-state':
      await showState(store, args.json === 'true');
      return;
    case 'run-cycle':
      await runCycle(store, runtimeConfig, logger);
      return;
    case 'export-backlog':
      await exportBacklog(store, args.format ?? 'md', args.out);
      return;
    default:
      throw new ConfigError(`Unknown command: ${String(command)}`);
  }
}

async function bootstrap(
  store: StateStore,
  state: ProjectState,
  logger: ReturnType<typeof createLogger>,
  snapshotOnBootstrap: boolean,
): Promise<void> {
  if (snapshotOnBootstrap) {
    await store.save(state);
  }

  await store.recordEvent(
    makeEvent('BOOTSTRAP_COMPLETED', {
      projectId: state.projectId,
      projectName: state.projectName,
    }),
  );

  logger.info('Bootstrap completed', {
    event: 'bootstrap_completed',
    result: 'ok',
  });
}

async function showState(store: StateStore, asJson: boolean): Promise<void> {
  const state = await store.load();
  if (asJson) {
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  console.log(`${state.projectName} (${state.projectId})`);
  console.log(`Summary: ${state.summary}`);
  console.log(`Milestones: ${Object.keys(state.milestones).length}`);
  console.log(`Tasks: ${Object.keys(state.backlog.tasks).length}`);
  console.log(`Failures: ${state.failures.length}`);
}

async function runCycle(
  store: StateStore,
  runtimeConfig: ReturnType<typeof loadRuntimeConfig>,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());

  const orchestrator = new Orchestrator(store, registry, runtimeConfig, logger);
  const result = await orchestrator.runCycle();
  console.log(JSON.stringify(result));
}

async function exportBacklog(store: StateStore, format: string, out?: string): Promise<void> {
  const state = await store.load();
  const outputPath = path.resolve(process.cwd(), out ?? `artifacts/backlog-export.${format}`);
  mkdirSync(path.dirname(outputPath), { recursive: true });

  const content =
    format === 'json'
      ? JSON.stringify(state.backlog, null, 2)
      : renderBacklogMarkdown(state);

  writeFileSync(outputPath, content, 'utf8');
  await store.recordArtifact({
    id: crypto.randomUUID(),
    type: 'backlog_export',
    title: 'Backlog export',
    location: outputPath,
    metadata: {
      format,
    },
    createdAt: new Date().toISOString(),
  });

  console.log(outputPath);
}

function renderBacklogMarkdown(state: ProjectState): string {
  const lines = ['# Backlog export', ''];

  for (const epic of Object.values(state.backlog.epics)) {
    lines.push(`## ${epic.title}`);
    lines.push(epic.goal);
    lines.push('');

    for (const featureId of epic.featureIds) {
      const feature = state.backlog.features[featureId];
      if (!feature) continue;

      lines.push(`### ${feature.title}`);
      lines.push(feature.outcome);
      lines.push('');

      for (const taskId of feature.taskIds) {
        const task = state.backlog.tasks[taskId];
        if (!task) continue;

        lines.push(`- [${task.status === 'done' ? 'x' : ' '}] ${task.title} (${task.priority})`);
      }

      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
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

function createStore(
  backend: 'memory' | 'sqlite',
  sqlitePath: string,
  initialState: ProjectState,
): StateStore {
  return backend === 'memory'
    ? new InMemoryStateStore(initialState)
    : new SqliteStateStore(sqlitePath, initialState);
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
