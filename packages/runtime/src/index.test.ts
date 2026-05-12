import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectState } from '@ai-orchestrator/core';
import { ConfigError } from '@ai-orchestrator/shared';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import {
  createProductionRoleRegistry,
  createRuntimeApplicationContext,
  createRoleRegistryForConfig,
  createStateStore,
  createSyntheticRoleRegistry,
} from './index.js';

void test('runtime composition creates concrete adapters outside the application package', async () => {
  const config = makeRuntimeConfig();
  const logger = createLogger(config, { sink: () => {} });

  const context = createRuntimeApplicationContext({
    config,
    logger,
    initialStateInput: {
      projectId: 'runtime-test',
      projectName: 'Runtime Test',
      summary: 'Runtime composition test',
    },
  });

  const state = await context.stateStore.load();

  assert.equal(state.projectId, 'runtime-test');
  assert.ok(context.roleRegistry.get('planner'));
  assert.equal(typeof context.orchestrator.runCycle, 'function');
});

void test('runtime state store selection keeps adapter choice in the outer layer', async () => {
  const store = createStateStore(
    makeRuntimeConfig(),
    createEmptyProjectState({
      projectId: 'memory-store',
      projectName: 'Memory Store',
      summary: 'Memory state store test',
    }),
  );

  assert.equal((await store.load()).projectId, 'memory-store');
});

void test('runtime role registry exposes production roles through the application role port', () => {
  const registry = createProductionRoleRegistry({
    generateObject: async () => ({
      action: 'final_output',
      changed: false,
      summary: 'no-op',
      changedFiles: [],
      evidence: [{ type: 'no_op', description: 'test no-op' }],
      noOpReason: 'test',
    }),
  });

  assert.equal(registry.get('bootstrap_analyst').name, 'bootstrap_analyst');
  assert.equal(registry.get('coder').name, 'coder');
});

void test('runtime production profile rejects mock provider and synthetic quality gate', () => {
  const config = makeProductionRuntimeConfig();
  config.llm.provider = 'mock';
  config.workflow.qualityGateMode = 'synthetic';
  delete config.llm.apiKey;

  assert.throws(
    () => createRoleRegistryForConfig(config),
    (error: unknown) =>
      error instanceof ConfigError &&
      Array.isArray(error.details) &&
      error.details.includes('workflow.roleProviderMode=production requires llm.provider to be openai or anthropic') &&
      error.details.includes('workflow.roleProviderMode=production cannot use workflow.qualityGateMode=synthetic') &&
      error.details.includes('workflow.roleProviderMode=production requires llm.apiKey'),
  );
});

void test('runtime synthetic profile keeps deterministic roles explicit', () => {
  const registry = createSyntheticRoleRegistry();

  assert.equal(registry.get('coder').name, 'coder');
  assert.equal(registry.get('reviewer').name, 'reviewer');
});

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1000,
    },
    state: {
      backend: 'memory',
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask: 2,
      roleProviderMode: 'synthetic',
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeProductionRuntimeConfig(): RuntimeConfig {
  return {
    ...makeRuntimeConfig(),
    llm: {
      provider: 'openai',
      model: 'gpt-test',
      apiKey: 'test-production-api-key',
      temperature: 0.2,
      timeoutMs: 1000,
    },
    workflow: {
      ...makeRuntimeConfig().workflow,
      roleProviderMode: 'production',
      qualityGateMode: 'tooling',
    },
  };
}
