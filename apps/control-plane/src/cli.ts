import {
  ArchitectureService,
  BootstrapService,
  ControlPlaneService,
  DocumentationService,
  IntegrationExportService,
  PlanningService,
  ReleaseReadinessService,
  StateIntegrityService,
  createApplicationContext,
} from '../../../packages/application/src/index.ts';
import {
  createLogger,
  loadRuntimeConfig,
  OrchestratorError,
  ConfigError,
} from '../../../packages/shared/src/index.ts';

type CommandName = 'bootstrap' | 'analyze-architecture' | 'plan-backlog' | 'generate-docs' | 'assess-release' | 'check-state' | 'prepare-export' | 'run-cycle' | 'run-task' | 'show-state' | 'export-backlog';

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2) as [CommandName | undefined, ...string[]];
  if (!command) {
    throw new ConfigError('Missing command. Use bootstrap, show-state, or export-backlog.');
  }

  const runtimeConfig = loadRuntimeConfig();
  const logger = createLogger(runtimeConfig);
  const args = parseArgs(rest);
  const application = createApplicationContext({
    config: runtimeConfig,
    logger,
    initialStateInput: {
      projectId: args['project-id'] ?? 'ai-orchestrator',
      projectName: args['project-name'] ?? 'AI Orchestrator',
      summary: args.summary ?? 'MVP runtime state',
    },
  });
  const bootstrapService = new BootstrapService(application.stateStore, application.roleRegistry, logger);
  const architectureService = new ArchitectureService(application.stateStore, application.roleRegistry, logger);
  const documentationService = new DocumentationService(
    application.stateStore,
    application.roleRegistry,
    runtimeConfig,
    logger,
  );
  const planningService = new PlanningService(application.stateStore, application.roleRegistry, logger);
  const releaseReadinessService = new ReleaseReadinessService(
    application.stateStore,
    application.roleRegistry,
    logger,
  );
  const integrationExportService = new IntegrationExportService(
    application.stateStore,
    application.roleRegistry,
    runtimeConfig,
    logger,
  );
  const stateIntegrityService = new StateIntegrityService(
    application.stateStore,
    application.roleRegistry,
    logger,
  );
  const controlPlaneService = new ControlPlaneService(application.stateStore, logger);

  switch (command) {
    case 'bootstrap':
      await bootstrapService.bootstrap(
        application.initialState,
        runtimeConfig.state.snapshotOnBootstrap,
      );
      return;
    case 'analyze-architecture':
      await analyzeArchitecture(architectureService);
      return;
    case 'plan-backlog':
      await planBacklog(planningService);
      return;
    case 'generate-docs':
      await generateDocs(documentationService, args.out);
      return;
    case 'assess-release':
      await assessRelease(releaseReadinessService);
      return;
    case 'check-state':
      await checkStateIntegrity(stateIntegrityService);
      return;
    case 'prepare-export':
      await prepareExport(integrationExportService, args.out);
      return;
    case 'show-state':
      await showState(controlPlaneService, args.json === 'true');
      return;
    case 'run-cycle':
      await runCycle(application.orchestrator);
      return;
    case 'run-task':
      await runTask(application.orchestrator, args['task-id']);
      return;
    case 'export-backlog':
      await exportBacklog(
        controlPlaneService,
        (args.format ?? 'md') as 'md' | 'json',
        args.out,
      );
      return;
    default:
      throw new ConfigError(`Unknown command: ${String(command)}`);
  }
}

async function showState(service: ControlPlaneService, asJson: boolean): Promise<void> {
  const view = await service.showState();
  if (asJson) {
    console.log(JSON.stringify(view.raw, null, 2));
    return;
  }

  console.log(`${view.summary.projectName} (${view.summary.projectId})`);
  console.log(`Summary: ${view.summary.summary}`);
  console.log(`Milestones: ${view.summary.counts.milestones}`);
  console.log(`Tasks: ${view.summary.counts.tasks}`);
  console.log(`Failures: ${view.summary.counts.failures}`);
}

async function runCycle(orchestrator: { runCycle: () => Promise<unknown> }): Promise<void> {
  const result = await orchestrator.runCycle();
  console.log(JSON.stringify(result));
}

async function runTask(
  orchestrator: { runSingleTask: (taskId: string) => Promise<unknown> },
  taskId?: string,
): Promise<void> {
  if (!taskId) {
    throw new ConfigError('Missing --task-id argument for run-task command.');
  }

  const result = await orchestrator.runSingleTask(taskId);
  console.log(JSON.stringify(result));
}

async function exportBacklog(
  service: ControlPlaneService,
  format: 'md' | 'json',
  out?: string,
): Promise<void> {
  const outputPath = await service.exportBacklog(format, out);
  console.log(outputPath);
}

async function analyzeArchitecture(service: ArchitectureService): Promise<void> {
  const analysis = await service.analyze();
  console.log(JSON.stringify(analysis));
}

async function planBacklog(service: PlanningService): Promise<void> {
  const plan = await service.plan();
  console.log(JSON.stringify(plan));
}

async function generateDocs(service: DocumentationService, out?: string): Promise<void> {
  const outputPath = await service.generate(out);
  console.log(outputPath);
}

async function assessRelease(service: ReleaseReadinessService): Promise<void> {
  const assessment = await service.assess();
  console.log(JSON.stringify(assessment));
}

async function checkStateIntegrity(service: StateIntegrityService): Promise<void> {
  const report = await service.inspect();
  console.log(JSON.stringify(report));
}

async function prepareExport(service: IntegrationExportService, out?: string): Promise<void> {
  const outputPath = await service.prepare(out);
  console.log(outputPath);
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
