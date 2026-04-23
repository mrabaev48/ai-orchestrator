import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ControlPlaneService } from '../packages/application/src/index.ts';
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
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
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

test('ControlPlaneService bootstrap persists initial state and event', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

  await service.bootstrap(state, true);

  const loaded = await store.load();
  assert.equal(loaded.projectId, 'project-1');
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0]?.eventType, 'BOOTSTRAP_COMPLETED');
});

test('ControlPlaneService exportBacklog writes artifact file through read model', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-app-'));
  const previousCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const state = createEmptyProjectState({
      projectId: 'project-1',
      projectName: 'Project',
      summary: 'Summary',
    });
    const store = new InMemoryStateStore(state);
    const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

    const outputPath = await service.exportBacklog('md');
    const content = readFileSync(outputPath, 'utf8');

    assert.match(content, /# Backlog export/);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
