import test from 'node:test';
import assert from 'node:assert/strict';

import { TesterRole } from '../packages/agents/src/index.ts';
import type { RoleExecutionContext, RoleRequest } from '../packages/core/src/index.ts';
import type { BacklogTask } from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';

function makeConfig(): RuntimeConfig {
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
      qualityGateMode: 'tooling',
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

function makeContext(qualityGateMode: 'tooling' | 'synthetic'): RoleExecutionContext {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    role: 'tester',
    stateSummary: 'summary',
    toolProfile: {
      allowedWritePaths: [process.cwd()],
      canWriteRepo: false,
      canApproveChanges: false,
      canRunTests: true,
    },
    toolExecution: {
      policy: 'quality_gate',
      permissionScope: 'test_execution',
      workspaceRoot: process.cwd(),
      evidenceSource: 'runtime_events',
      qualityGateMode,
    },
    logger: createLogger(makeConfig(), { sink: () => {} }),
  };
}

function makeRequest(acceptanceCriteria: string[] = ['done']): RoleRequest<{ task: BacklogTask; result: { changed: boolean; summary: string } }> {
  return {
    role: 'tester',
    objective: 'Test task',
    acceptanceCriteria: ['Return explicit evidence'],
    input: {
      task: {
        id: 'task-1',
        featureId: 'feature-1',
        title: 'Task',
        kind: 'testing',
        status: 'todo',
        priority: 'p1',
        dependsOn: [],
        acceptanceCriteria,
        affectedModules: ['packages/execution'],
        estimatedRisk: 'low',
      },
      result: {
        changed: true,
        summary: 'ok',
      },
    },
  };
}

test('TesterRole executeStep requests build stage first in tooling mode', async () => {
  const tester = new TesterRole();
  const step = await tester.executeStep?.(
    makeRequest(),
    makeContext('tooling'),
    [],
  );

  assert.equal(step?.type, 'tool_request');
  assert.equal(step?.request.toolName, 'testing_run');
  assert.deepEqual(step?.request.input.args, ['run', 'build']);
});

test('TesterRole executeStep returns final output from stage observations', async () => {
  const tester = new TesterRole();
  const observations = [
    { step: 1, toolName: 'testing_run', ok: true, output: { ok: true }, createdAt: new Date().toISOString() },
    { step: 2, toolName: 'testing_run', ok: true, output: { ok: true }, createdAt: new Date().toISOString() },
    { step: 3, toolName: 'testing_run', ok: true, output: { ok: true }, createdAt: new Date().toISOString() },
    { step: 4, toolName: 'testing_run', ok: true, output: { ok: true }, createdAt: new Date().toISOString() },
  ] as const;

  const step = await tester.executeStep?.(makeRequest(), makeContext('tooling'), observations);

  assert.equal(step?.type, 'final_output');
  if (step?.type !== 'final_output') {
    assert.fail('Expected final output');
  }
  assert.equal(step.response.output.passed, true);
  assert.equal(step.response.output.qualityStages?.length, 4);
});

test('TesterRole executeStep keeps deterministic synthetic failure markers', async () => {
  const tester = new TesterRole();
  const step = await tester.executeStep?.(
    makeRequest(['[fail-lint]']),
    makeContext('tooling'),
    [],
  );

  assert.equal(step?.type, 'final_output');
  if (step?.type !== 'final_output') {
    assert.fail('Expected final output');
  }
  assert.equal(step.response.output.passed, false);
  assert.equal(step.response.output.failures?.includes('lint stage failed') ?? false, true);
});
