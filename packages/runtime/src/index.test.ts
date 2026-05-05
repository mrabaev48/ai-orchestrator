import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyProjectState } from '@ai-orchestrator/core';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import { createRoleRegistry, createRuntimeApplicationContext, createStateStore } from './index.js';

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
  const registry = createRoleRegistry();

  assert.equal(registry.get('bootstrap_analyst').name, 'bootstrap_analyst');
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
