import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ArchitectureService,
  BootstrapService,
  DocumentationService,
  IntegrationExportService,
  PlanningService,
  createRoleRegistry,
} from '../packages/application/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

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

test('IntegrationExportService writes export payload with traceability to artifact file', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-integration-export-'));

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
    const logger = createLogger(makeRuntimeConfig(tempDir), { sink: () => {} });

    await new BootstrapService(store, roleRegistry, logger, tempDir).bootstrap(state, true);
    await new ArchitectureService(store, roleRegistry, logger, tempDir).analyze();
    await new PlanningService(store, roleRegistry, logger).plan();

    const previousCwd = process.cwd();
    process.chdir(tempDir);

    try {
      await new DocumentationService(store, roleRegistry, makeRuntimeConfig(tempDir), logger).generate();
      const outputPath = await new IntegrationExportService(
        store,
        roleRegistry,
        makeRuntimeConfig(tempDir),
        logger,
      ).prepare();
      const content = JSON.parse(readFileSync(outputPath, 'utf8')) as { mappedEntities: unknown[] };
      const loaded = await store.load();

      assert.ok(content.mappedEntities.length >= 1);
      assert.equal(loaded.artifacts.some((artifact) => artifact.type === 'integration_export'), true);
    } finally {
      process.chdir(previousCwd);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
