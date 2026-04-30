import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultExecutionPolicyEngine } from '../packages/core/src/index.ts';
import { createLogger } from '../packages/shared/src/index.ts';

const logger = createLogger({
  llm: { provider: 'mock', model: 'm', temperature: 0, timeoutMs: 1000 },
  state: { backend: 'memory', postgresDsn: '', postgresSchema: 'public', snapshotOnBootstrap: true, snapshotOnTaskCompletion: true, snapshotOnMilestoneCompletion: true },
  workflow: { maxStepsPerRun: 5, maxRetriesPerTask: 1 },
  tools: { allowedWritePaths: [process.cwd()], typescriptDiagnosticsEnabled: true, allowedShellCommands: ['node'], persistToolEvidence: true },
  logging: { level: 'error', format: 'json' },
}, { sink: () => {} });

test('execution policy engine applies repo-write policy for coder', () => {
  const context = defaultExecutionPolicyEngine.resolve({
    runId: 'r1',
    role: 'coder',
    stateSummary: 's',
    workspaceRoot: process.cwd(),
    allowedWritePaths: [process.cwd()],
    evidenceSource: 'runtime_events',
    logger,
  });

  assert.equal(context.toolProfile.canWriteRepo, true);
  assert.equal(context.toolExecution.policy, 'orchestrator_default');
  assert.equal(context.toolExecution.permissionScope, 'repo_write');
});

test('execution policy engine applies quality-gate policy for tester', () => {
  const context = defaultExecutionPolicyEngine.resolve({
    runId: 'r2',
    role: 'tester',
    stateSummary: 's',
    workspaceRoot: process.cwd(),
    allowedWritePaths: [process.cwd()],
    evidenceSource: 'runtime_events',
    logger,
  });

  assert.equal(context.toolProfile.canRunTests, true);
  assert.equal(context.toolExecution.policy, 'quality_gate');
  assert.equal(context.toolExecution.permissionScope, 'test_execution');
  assert.deepEqual(context.toolProfile.allowedWritePaths, []);
});
