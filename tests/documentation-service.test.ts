import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ArchitectureService,
  BootstrapService,
  DocumentationService,
  PlanningService,
} from '@ai-orchestrator/application';
import { createEmptyProjectState } from '@ai-orchestrator/core';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import { InMemoryStateStore } from '@ai-orchestrator/state';
import { createTestApplicationRoleRegistry } from './support/application-role-registry.js';

function makeRuntimeConfig(allowedWritePath: string): RuntimeConfig {
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
      allowedWritePaths: [allowedWritePath],
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

test('DocumentationService writes generated documentation within allowed paths', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-docs-service-'));

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
    const roleRegistry = createTestApplicationRoleRegistry();
    const logger = createLogger(makeRuntimeConfig(tempDir), { sink: () => {} });

    await new BootstrapService(store, roleRegistry, logger, tempDir).bootstrap(state, true);
    await new ArchitectureService(store, roleRegistry, logger, tempDir).analyze();
    await new PlanningService(store, roleRegistry, logger).plan();

    const previousCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const outputPath = await new DocumentationService(
        store,
        roleRegistry,
        makeRuntimeConfig(tempDir),
        logger,
      ).generate();
      const content = readFileSync(outputPath, 'utf8');
      const loaded = await store.load();

      assert.match(content, /# Project update summary/);
      assert.equal(loaded.artifacts.some((artifact) => artifact.type === 'documentation'), true);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
