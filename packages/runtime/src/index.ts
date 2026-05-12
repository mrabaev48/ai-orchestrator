import {
  ArchitectRole,
  BootstrapAnalystRole,
  CoderRole,
  DocsWriterRole,
  IntegrationManagerRole,
  PlannerRole,
  ProductionCoderRole,
  ProductionReviewerRole,
  PromptEngineerRole,
  ReleaseAuditorRole,
  ReviewerRole,
  RoleRegistry,
  StateStewardRole,
  TaskManagerRole,
  TesterRole,
} from '@ai-orchestrator/agents';
import type { ApplicationRoleRegistry, ApplicationStateStore } from '@ai-orchestrator/application';
import { createEmptyProjectState, type ProjectState } from '@ai-orchestrator/core';
import { Orchestrator } from '@ai-orchestrator/execution';
import { ConfigError, type Logger, type RuntimeConfig } from '@ai-orchestrator/shared';
import { createLlmClient, type LlmClient } from '@ai-orchestrator/llm';
import {
  InMemoryStateStore,
  PostgresStateStore,
  type StateStore,
} from '@ai-orchestrator/state';

export interface RuntimeApplicationContext {
  initialState: ProjectState;
  stateStore: ApplicationStateStore;
  roleRegistry: ApplicationRoleRegistry;
  orchestrator: Orchestrator;
}

export function createRuntimeApplicationContext(input: {
  config: RuntimeConfig;
  logger: Logger;
  initialStateInput?: {
    projectId: string;
    projectName: string;
    summary: string;
  };
  llmClient?: LlmClient;
}): RuntimeApplicationContext {
  const initialState = createEmptyProjectState({
    projectId: input.initialStateInput?.projectId ?? 'ai-orchestrator',
    projectName: input.initialStateInput?.projectName ?? 'AI Orchestrator',
    summary: input.initialStateInput?.summary ?? 'MVP runtime state',
  });

  const stateStore = createStateStore(input.config, initialState);
  const roleRegistry = createRoleRegistryForConfig(input.config, input.llmClient);
  const orchestrator = new Orchestrator(stateStore, roleRegistry, input.config, input.logger);

  return {
    initialState,
    stateStore,
    roleRegistry,
    orchestrator,
  };
}

export function createRoleRegistryForConfig(config: RuntimeConfig, llmClient?: LlmClient): RoleRegistry {
  if (config.workflow.roleProviderMode === 'synthetic') {
    return createSyntheticRoleRegistry();
  }
  validateProductionRoleRuntimeConfig(config);
  return createProductionRoleRegistry(llmClient ?? createLlmClient({
    provider: config.llm.provider,
    model: config.llm.model,
    temperature: config.llm.temperature,
    timeoutMs: config.llm.timeoutMs,
    ...(config.llm.apiKey ? { apiKey: config.llm.apiKey } : {}),
  }));
}

export function createProductionRoleRegistry(llmClient: LlmClient): RoleRegistry {
  const registry = createBaseRoleRegistry();
  registry.register(new ProductionCoderRole(llmClient));
  registry.register(new ProductionReviewerRole(llmClient));
  registry.register(new TesterRole());
  return registry;
}

export function createSyntheticRoleRegistry(): RoleRegistry {
  const registry = createBaseRoleRegistry();
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

export function createRoleRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

function createBaseRoleRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new BootstrapAnalystRole());
  registry.register(new ArchitectRole());
  registry.register(new PlannerRole());
  registry.register(new DocsWriterRole());
  registry.register(new ReleaseAuditorRole());
  registry.register(new StateStewardRole());
  registry.register(new IntegrationManagerRole());
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  return registry;
}

function validateProductionRoleRuntimeConfig(config: RuntimeConfig): void {
  const issues: string[] = [];
  if (config.llm.provider === 'mock') {
    issues.push('workflow.roleProviderMode=production requires llm.provider to be openai or anthropic');
  }
  if (config.workflow.qualityGateMode === 'synthetic') {
    issues.push('workflow.roleProviderMode=production cannot use workflow.qualityGateMode=synthetic');
  }
  if (!config.llm.apiKey?.trim()) {
    issues.push('workflow.roleProviderMode=production requires llm.apiKey');
  }
  if (issues.length > 0) {
    throw new ConfigError('Invalid production role runtime configuration', { details: issues });
  }
}

export function createStateStore(config: RuntimeConfig, initialState: ProjectState): StateStore {
  return config.state.backend === 'memory'
    ? new InMemoryStateStore(initialState)
    : new PostgresStateStore(config.state.postgresDsn, initialState, config.state.postgresSchema);
}
