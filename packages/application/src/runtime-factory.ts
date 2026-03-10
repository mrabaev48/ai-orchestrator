import {
  ArchitectRole,
  BootstrapAnalystRole,
  CoderRole,
  PlannerRole,
  PromptEngineerRole,
  ReviewerRole,
  RoleRegistry,
  TaskManagerRole,
  TesterRole,
} from '../../agents/src/index.ts';
import { createEmptyProjectState, type ProjectState } from '../../core/src/index.ts';
import { Orchestrator } from '../../execution/src/index.ts';
import type { Logger, RuntimeConfig } from '../../shared/src/index.ts';
import {
  InMemoryStateStore,
  SqliteStateStore,
  type StateStore,
} from '../../state/src/index.ts';

export interface ApplicationContext {
  initialState: ProjectState;
  stateStore: StateStore;
  roleRegistry: RoleRegistry;
  orchestrator: Orchestrator;
}

export function createApplicationContext(input: {
  config: RuntimeConfig;
  logger: Logger;
  initialStateInput?: {
    projectId: string;
    projectName: string;
    summary: string;
  };
}): ApplicationContext {
  const initialState = createEmptyProjectState({
    projectId: input.initialStateInput?.projectId ?? 'ai-orchestrator',
    projectName: input.initialStateInput?.projectName ?? 'AI Orchestrator',
    summary: input.initialStateInput?.summary ?? 'MVP runtime state',
  });

  const stateStore = createStateStore(input.config, initialState);
  const roleRegistry = createRoleRegistry();
  const orchestrator = new Orchestrator(stateStore, roleRegistry, input.config, input.logger);

  return {
    initialState,
    stateStore,
    roleRegistry,
    orchestrator,
  };
}

export function createRoleRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new BootstrapAnalystRole());
  registry.register(new ArchitectRole());
  registry.register(new PlannerRole());
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

export function createStateStore(config: RuntimeConfig, initialState: ProjectState): StateStore {
  return config.state.backend === 'memory'
    ? new InMemoryStateStore(initialState)
    : new SqliteStateStore(config.state.sqlitePath, initialState);
}
