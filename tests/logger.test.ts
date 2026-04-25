import test from 'node:test';
import assert from 'node:assert/strict';

import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';

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
      level: 'info',
      format: 'json',
    },
  };
}

test('createLogger redacts secret-like values in log payloads', () => {
  const lines: string[] = [];
  const logger = createLogger(makeRuntimeConfig(), {
    sink: (line) => {
      lines.push(line);
    },
  });

  logger.info('Authorization Bearer abcdefghijklmnopqrstuvwxyz123456', {
    data: {
      apiKey: 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456',
    },
  });

  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0] ?? '{}') as {
    message?: string;
    data?: { apiKey?: string };
  };

  assert.equal(payload.message, 'Authorization Bearer <redacted>');
  assert.equal(payload.data?.apiKey, '<redacted>');
});
