import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BootstrapService,
  collectBootstrapRepositorySnapshot,
  createRoleRegistry,
} from '../packages/application/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

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
      sqlitePath: '/tmp/unused.db',
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
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('collectBootstrapRepositorySnapshot discovers workspace structure', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-bootstrap-snapshot-'));

  try {
    mkdirSync(path.join(tempDir, 'apps/control-plane/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/core/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
    writeFileSync(path.join(tempDir, 'package.json'), '{"name":"demo"}', 'utf8');
    writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}', 'utf8');
    writeFileSync(path.join(tempDir, 'eslint.config.mjs'), 'export default [];', 'utf8');

    const snapshot = collectBootstrapRepositorySnapshot(tempDir);

    assert.deepEqual(snapshot.packageDirectories, ['apps/control-plane', 'packages/core']);
    assert.deepEqual(snapshot.entryPoints, ['apps/control-plane/src', 'packages/core/src']);
    assert.deepEqual(snapshot.testInfrastructure, ['tests']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('BootstrapService persists discovery output and bootstrap artifact', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-bootstrap-service-'));

  try {
    mkdirSync(path.join(tempDir, 'apps/control-plane/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/core/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/workflow/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'tests'), { recursive: true });
    writeFileSync(path.join(tempDir, 'package.json'), '{"name":"demo"}', 'utf8');
    writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}', 'utf8');
    writeFileSync(path.join(tempDir, 'eslint.config.mjs'), 'export default [];', 'utf8');

    const state = createEmptyProjectState({
      projectId: 'project-1',
      projectName: 'Project',
      summary: 'Summary',
    });
    const store = new InMemoryStateStore(state);
    const bootstrapService = new BootstrapService(
      store,
      createRoleRegistry(),
      createLogger(makeRuntimeConfig(), { sink: () => {} }),
      tempDir,
    );

    await bootstrapService.bootstrap(state, true);

    const loaded = await store.load();

    assert.deepEqual(loaded.discovery.packageInventory, [
      'apps/control-plane',
      'packages/core',
      'packages/workflow',
    ]);
    assert.equal(loaded.discovery.recommendedNextStep, 'architecture_analysis');
    assert.deepEqual(loaded.architecture.criticalPaths, [
      'apps/control-plane/src',
      'packages/core/src',
      'packages/workflow/src',
    ]);
    assert.equal(loaded.artifacts[0]?.type, 'bootstrap_analysis');
    assert.deepEqual(store.events.map((event) => event.eventType), [
      'DISCOVERY_COMPLETED',
      'BOOTSTRAP_COMPLETED',
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
