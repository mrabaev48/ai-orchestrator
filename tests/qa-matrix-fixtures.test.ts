import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { TesterRole } from '../packages/agents/src/index.ts';
import type { BacklogTask, RoleExecutionContext, RoleObservation, RoleRequest } from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import { createLocalToolSet } from '../packages/tools/src/index.ts';

function makeConfig(): RuntimeConfig {
  return {
    llm: { provider: 'mock', model: 'mock-model', temperature: 0, timeoutMs: 1_000 },
    state: {
      backend: 'memory',
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: { maxStepsPerRun: 5, maxRetriesPerTask: 2, qualityGateMode: 'tooling' },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm'],
      persistToolEvidence: true,
    },
    logging: { level: 'error', format: 'json' },
  };
}

function makeContext(workspaceRoot: string): RoleExecutionContext {
  return {
    runId: 'run-fixture',
    taskId: 'task-fixture',
    role: 'tester',
    stateSummary: 'qa fixture matrix',
    toolProfile: {
      allowedWritePaths: [workspaceRoot],
      canWriteRepo: false,
      canApproveChanges: false,
      canRunTests: true,
    },
    toolExecution: {
      policy: 'quality_gate',
      permissionScope: 'test_execution',
      workspaceRoot,
      evidenceSource: 'runtime_events',
      qualityGateMode: 'tooling',
    },
    logger: createLogger(makeConfig(), { sink: () => {} }),
  };
}

function makeRequest(): RoleRequest<{ task: BacklogTask; result: { changed: boolean; summary: string } }> {
  return {
    role: 'tester',
    objective: 'Validate quality stages',
    acceptanceCriteria: ['Run quality stages against fixture repo'],
    input: {
      task: {
        id: 'task-fixture',
        featureId: 'feature-fixture',
        title: 'Run QA matrix',
        kind: 'testing',
        status: 'todo',
        priority: 'p1',
        dependsOn: [],
        acceptanceCriteria: ['execute full quality gate'],
        affectedModules: ['tests/fixtures/qa-matrix'],
        estimatedRisk: 'low',
      },
      result: {
        changed: false,
        summary: 'fixture run',
      },
    },
  };
}

async function runQualityStagesWithFixture(workspaceRoot: string): Promise<RoleObservation[]> {
  const tools = createLocalToolSet({
    allowedWritePaths: [workspaceRoot],
    allowedShellCommands: ['node', 'npm'],
  });

  const stages = ['build', 'lint', 'typecheck', 'test'];
  const observations: RoleObservation[] = [];

  for (const stage of stages) {
    const toolResult = await tools.execute({
      toolName: 'testing_run',
      input: {
        command: 'npm',
        args: ['--prefix', workspaceRoot, 'run', stage],
        cwd: workspaceRoot,
        timeoutMs: 30_000,
      },
    });
    const output = toolResult.ok
      ? (toolResult.output as { ok: boolean; stderr?: string })
      : { ok: false, stderr: toolResult.error.message };

    const observation: RoleObservation = {
      step: observations.length + 1,
      toolName: 'testing_run',
      ok: output.ok,
      output,
      createdAt: new Date().toISOString(),
    };
    if (!output.ok) {
      observation.error = output.stderr ?? 'quality stage failed';
    }
    observations.push(observation);
  }

  return observations;
}

const fixturesRoot = path.resolve('tests/fixtures/qa-matrix');

test('QA matrix fixtures: library, nest app, and monorepo pass all quality stages', async () => {
  const fixtureNames = ['library', 'nest-app', 'monorepo'];
  const tester = new TesterRole();

  for (const fixtureName of fixtureNames) {
    const fixturePath = path.join(fixturesRoot, fixtureName);
    const observations = await runQualityStagesWithFixture(fixturePath);

    const step = await tester.executeStep?.(makeRequest(), makeContext(fixturePath), observations);
    assert.equal(step?.type, 'final_output');
    if (step?.type !== 'final_output') {
      assert.fail('Expected final output from tester role');
    }

    assert.equal(step.response.output.passed, true);
    assert.equal(step.response.output.qualityStages?.every((stage) => stage.status === 'passing'), true);
  }
});

test('QA matrix fixture: failing-tests records deterministic failing test stage', async () => {
  const tester = new TesterRole();
  const fixturePath = path.join(fixturesRoot, 'failing-tests');
  const observations = await runQualityStagesWithFixture(fixturePath);

  const step = await tester.executeStep?.(makeRequest(), makeContext(fixturePath), observations);
  assert.equal(step?.type, 'final_output');
  if (step?.type !== 'final_output') {
    assert.fail('Expected final output from tester role');
  }

  assert.equal(step.response.output.passed, false);
  assert.equal(step.response.output.failures?.includes('test stage failed') ?? false, true);
  const testStage = step.response.output.qualityStages?.find((stage) => stage.stage === 'test');
  assert.equal(testStage?.status, 'failing');
});
