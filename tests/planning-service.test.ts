import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ArchitectureService,
  BootstrapService,
  PlanningService,
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
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('PlanningService persists backlog and active milestone after discovery and architecture analysis', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-planning-service-'));

  try {
    mkdirSync(path.join(tempDir, 'apps/control-plane/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/application/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/execution/src'), { recursive: true });
    writeFileSync(path.join(tempDir, 'package.json'), '{"name":"demo"}', 'utf8');
    writeFileSync(path.join(tempDir, 'tsconfig.json'), '{}', 'utf8');
    writeFileSync(
      path.join(tempDir, 'apps/control-plane/src/cli.ts'),
      "import '../../../packages/application/src/index.ts';\n",
      'utf8',
    );

    const state = createEmptyProjectState({
      projectId: 'project-1',
      projectName: 'Project',
      summary: 'Summary',
    });
    const store = new InMemoryStateStore(state);
    const roleRegistry = createRoleRegistry();
    const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });

    await new BootstrapService(store, roleRegistry, logger, tempDir).bootstrap(state, true);
    await new ArchitectureService(store, roleRegistry, logger, tempDir).analyze();

    const plan = await new PlanningService(store, roleRegistry, logger).plan();
    const loaded = await store.load();

    assert.ok(Object.keys(plan.backlog.tasks).length >= 1);
    assert.equal(loaded.currentMilestoneId, plan.milestone.id);
    assert.equal(loaded.milestones[plan.milestone.id]?.status, 'in_progress');
    assert.equal(loaded.artifacts.some((artifact) => artifact.type === 'plan'), true);
    assert.equal(store.events.some((event) => event.eventType === 'BACKLOG_PLANNED'), true);
    assert.equal(plan.dependencyEdges.length > 0, true);
    assert.equal(plan.assumptions.length > 0, true);
    assert.equal(plan.mergePreview.batches.length > 0, true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
