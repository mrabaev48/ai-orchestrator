import {
  ArchitectureService,
  BootstrapService,
  ControlPlaneService,
  DocumentationService,
  IntegrationExportService,
  PlanningService,
  ReleaseReadinessService,
  StateIntegrityService,
  evaluateHumanOverride,
  evaluateKillSwitch,
  createApplicationContext,
} from '../../../packages/application/src/index.ts';
import {
  createLogger,
  loadRuntimeConfig,
  OrchestratorError,
  ConfigError,
  SafetyViolationError,
} from '../../../packages/shared/src/index.ts';
import { authorizeControlPlaneCommand } from './authz/rbac-abac.ts';

type CommandName = 'bootstrap' | 'analyze-architecture' | 'plan-backlog' | 'generate-docs' | 'assess-release' | 'check-state' | 'prepare-export' | 'run-cycle' | 'run-task' | 'show-state' | 'export-backlog' | 'resume-failure' | 'replay-failure';

const RESTRICTED_COMMANDS = new Set<CommandName>([
  'bootstrap',
  'analyze-architecture',
  'plan-backlog',
  'generate-docs',
  'assess-release',
  'check-state',
  'prepare-export',
  'run-cycle',
  'run-task',
  'resume-failure',
  'replay-failure',
]);

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2) as [CommandName | undefined, ...string[]];
  if (!command) {
    throw new ConfigError('Missing command. Use bootstrap, show-state, or export-backlog.');
  }

  const runtimeConfig = loadRuntimeConfig();
  const logger = createLogger(runtimeConfig);
  const args = parseArgs(rest);
  const actorTeam = args['actor-team'] ?? process.env.CONTROL_PLANE_ACTOR_TEAM;
  const ownerTeam = args['project-owner-team'] ?? process.env.CONTROL_PLANE_PROJECT_OWNER_TEAM;
  const actorSubject = args['actor-subject'] ?? process.env.CONTROL_PLANE_ACTOR_SUBJECT ?? 'local-operator';

  const killSwitchReason = args['kill-switch-reason'] ?? process.env.CONTROL_PLANE_KILL_SWITCH_REASON;
  const killSwitchActivatedAt = args['kill-switch-activated-at'] ?? process.env.CONTROL_PLANE_KILL_SWITCH_ACTIVATED_AT;
  const overrideToken = args['human-override-token'] ?? process.env.CONTROL_PLANE_HUMAN_OVERRIDE_TOKEN;
  const overrideReason = args['human-override-reason'] ?? process.env.CONTROL_PLANE_HUMAN_OVERRIDE_REASON;
  const overrideTicketId = args['human-override-ticket-id'] ?? process.env.CONTROL_PLANE_HUMAN_OVERRIDE_TICKET_ID;
  const overrideExpiresAt = args['human-override-expires-at'] ?? process.env.CONTROL_PLANE_HUMAN_OVERRIDE_EXPIRES_AT;

  enforceKillSwitchAndHumanOverride({
    command,
    actorSubject,
    killSwitchActive: parseBoolean(args['kill-switch-active'] ?? process.env.CONTROL_PLANE_KILL_SWITCH_ACTIVE),
    ...(killSwitchReason ? { killSwitchReason } : {}),
    ...(killSwitchActivatedAt ? { killSwitchActivatedAt } : {}),
    ...(overrideToken ? { overrideToken } : {}),
    ...(overrideReason ? { overrideReason } : {}),
    ...(overrideTicketId ? { overrideTicketId } : {}),
    ...(overrideExpiresAt ? { overrideExpiresAt } : {}),
  });

  authorizeControlPlaneCommand({
    command,
    principal: {
      subject: actorSubject,
      roles: parseRoles(args['actor-roles'] ?? process.env.CONTROL_PLANE_ACTOR_ROLES ?? 'control-plane.admin,control-plane.operator,control-plane.viewer'),
      ...(actorTeam ? { team: actorTeam } : {}),
    },
    resource: {
      projectId: args['project-id'] ?? 'ai-orchestrator',
      environment: parseEnvironment(args.environment ?? process.env.CONTROL_PLANE_ENVIRONMENT),
      ...(ownerTeam ? { ownerTeam } : {}),
    },
  });
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
    case 'resume-failure':
      await resumeFailure(controlPlaneService, args['failure-id']);
      return;
    case 'replay-failure':
      await replayFailure(controlPlaneService, args['failure-id']);
      return;
    default:
      throw new ConfigError(`Unknown command: ${String(command)}`);
  }
}

async function resumeFailure(service: ControlPlaneService, failureId?: string): Promise<void> {
  if (!failureId) {
    throw new ConfigError('Missing --failure-id argument for resume-failure command.');
  }
  await service.resumeFailure(failureId);
  console.log(JSON.stringify({ status: 'ok', failureId }));
}

async function replayFailure(service: ControlPlaneService, failureId?: string): Promise<void> {
  if (!failureId) {
    throw new ConfigError('Missing --failure-id argument for replay-failure command.');
  }
  const result = await service.replayFromFailureCheckpoint(failureId);
  console.log(JSON.stringify(result));
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


function enforceKillSwitchAndHumanOverride(input: {
  command: CommandName;
  actorSubject: string;
  killSwitchActive: boolean;
  killSwitchReason?: string;
  killSwitchActivatedAt?: string;
  overrideToken?: string;
  overrideReason?: string;
  overrideTicketId?: string;
  overrideExpiresAt?: string;
}): void {
  const killSwitchDecision = evaluateKillSwitch({
    command: input.command,
    commandPolicy: RESTRICTED_COMMANDS.has(input.command) ? 'restricted' : 'read_only',
    killSwitch: {
      active: input.killSwitchActive,
      ...(input.killSwitchReason ? { reason: input.killSwitchReason } : {}),
      ...(input.killSwitchActivatedAt ? { activatedAt: input.killSwitchActivatedAt } : {}),
    },
  });

  if (killSwitchDecision.allowed) {
    return;
  }

  const overrideDecision = evaluateHumanOverride({
    actorSubject: input.actorSubject,
    ...(input.overrideToken ? { overrideToken: input.overrideToken } : {}),
    ...(input.overrideReason ? { overrideReason: input.overrideReason } : {}),
    ...(input.overrideTicketId ? { overrideTicketId: input.overrideTicketId } : {}),
    ...(input.overrideExpiresAt ? { overrideExpiresAt: input.overrideExpiresAt } : {}),
    nowIso: new Date().toISOString(),
  });

  if (overrideDecision.allowed) {
    return;
  }

  throw new SafetyViolationError('Kill-switch active: human override is required for restricted command.', {
    details: {
      command: input.command,
      killSwitch: killSwitchDecision.evidence,
      override: overrideDecision.evidence,
      reason: overrideDecision.reasonCode,
    },
    needsHumanDecision: true,
  });
}

function parseBoolean(raw: string | undefined): boolean {
  return raw === '1' || raw === 'true';
}

function parseRoles(raw: string): string[] {
  return raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

function parseEnvironment(raw: string | undefined): 'local' | 'ci' | 'prod' {
  if (raw === 'ci' || raw === 'prod') {
    return raw;
  }

  return 'local';
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
