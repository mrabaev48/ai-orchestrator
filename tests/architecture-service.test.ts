import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ArchitectureService,
  BootstrapService,
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

test('ArchitectureService persists architect findings after bootstrap baseline', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-architecture-service-'));

  try {
    mkdirSync(path.join(tempDir, 'apps/control-plane/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/application/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/execution/src'), { recursive: true });
    mkdirSync(path.join(tempDir, 'packages/workflow/src'), { recursive: true });
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
    const bootstrapService = new BootstrapService(store, roleRegistry, logger, tempDir);
    const architectureService = new ArchitectureService(store, roleRegistry, logger, tempDir);

    await bootstrapService.bootstrap(state, true);
    const analysis = await architectureService.analyze();
    const loaded = await store.load();

    assert.ok(analysis.findings.length >= 1);
    assert.equal(loaded.architecture.findings.length, analysis.findings.length);
    assert.match(loaded.architecture.analysisSummary ?? '', /Detected \d+ architecture finding/);
    assert.equal(loaded.decisions.length, 1);
    assert.equal(loaded.artifacts.some((artifact) => artifact.type === 'architecture_analysis'), true);
    assert.equal(store.events.some((event) => event.eventType === 'ARCHITECTURE_ANALYZED'), true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
