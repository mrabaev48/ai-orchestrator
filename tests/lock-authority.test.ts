import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLockAuthority,
  NoopLockAuthority,
} from '../packages/execution/src/index.ts';
import type { RuntimeConfig } from '../packages/shared/src/index.ts';

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1_000,
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
      maxStepsPerRun: 8,
      maxRetriesPerTask: 3,
      workerCount: 1,
      runLockProvider: 'noop',
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      allowedShellCommands: ['node'],
      typescriptDiagnosticsEnabled: true,
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('createLockAuthority defaults to NoopLockAuthority in single-worker mode', () => {
  const authority = createLockAuthority(makeRuntimeConfig());
  assert.equal(authority instanceof NoopLockAuthority, true);
});

