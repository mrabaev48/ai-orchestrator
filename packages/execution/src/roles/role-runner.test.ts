import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProjectState,
  type AgentRole,
  type CodeExecutionOutput,
  type RoleExecutionContext,
  type RoleRequest,
  type RoleResponse,
  type RoleStepResult,
} from '@ai-orchestrator/core';
import { createLogger, type RuntimeConfig, WorkflowPolicyError } from '@ai-orchestrator/shared';
import { InMemoryStateStore } from '@ai-orchestrator/state';
import { createLocalToolSet } from '@ai-orchestrator/tools';

import type { ExecutionTelemetry } from '../telemetry.js';
import { RunStepRecorder } from '../persistence/run-step-recorder.js';
import { RoleRunner, RoleRunCostTracker, runWithTimeout } from './role-runner.js';

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
      qualityGateMode: 'synthetic',
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

function makeContext(config: RuntimeConfig): RoleExecutionContext {
  return {
    role: 'coder',
    runId: 'run-1',
    taskId: 'task-1',
    stateSummary: 'state',
    workspaceRoot: process.cwd(),
    allowedWritePaths: config.tools.allowedWritePaths,
    evidenceSource: 'runtime_events',
    qualityGateMode: 'synthetic',
    logger: createLogger(config, { sink: () => {} }),
  };
}

function makeRunner(config = makeConfig()) {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const recorder = new RunStepRecorder(store);
  recorder.startRun('run-1', { tenantId: state.orgId, projectId: state.projectId });
  const telemetry: ExecutionTelemetry = {
    incrementCounter: async () => {},
    recordHistogram: async () => {},
  };
  const runner = new RoleRunner({
    stateStore: store,
    config,
    telemetry,
    runStepRecorder: recorder,
    costTracker: new RoleRunCostTracker(),
    tools: createLocalToolSet(config.tools.allowedWritePaths),
  });
  return { runner, recorder, state, config };
}

function makeCoderResponse(summary: string): RoleResponse<CodeExecutionOutput> {
  return {
    role: 'coder',
    summary,
    output: {
      changed: true,
      summary,
      changedFiles: ['packages/execution'],
      evidence: [{ type: 'tool_observation', description: 'Observed role execution in test' }],
    },
    warnings: [],
    risks: [],
    needsHumanDecision: false,
    confidence: 0.9,
  };
}

test('RoleRunner executes step loop and records role evidence', async () => {
  class LoopingCoderRole implements AgentRole<{ task: string }, CodeExecutionOutput> {
    readonly name = 'coder' as const;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      throw new Error('execute should not be called');
    }

    async executeStep(
      request: RoleRequest<{ task: string }>,
      context: RoleExecutionContext,
      observations: readonly unknown[],
    ): Promise<RoleStepResult<CodeExecutionOutput>> {
      void request;
      void context;
      if (observations.length === 0) {
        return {
          type: 'tool_request',
          request: {
            toolName: 'git_status',
            input: {},
            rationale: 'Inspect workspace status',
          },
        };
      }
      return { type: 'final_output', response: makeCoderResponse('done') };
    }
  }

  const { runner, recorder, state, config } = makeRunner();
  const response = await runner.execute(
    new LoopingCoderRole(),
    {
      role: 'coder',
      objective: 'Execute task',
      input: { task: 'task-1' },
      acceptanceCriteria: ['done'],
    },
    makeContext(config),
  );
  recorder.flushToState(state);

  assert.equal(response.output.summary, 'done');
  assert.equal(state.execution.runStepLog.some((step) => step.tool === 'git_status'), true);
  assert.equal(state.execution.runStepLog.some((step) => step.tool === 'role.execute'), true);
});

test('RoleRunner retries once after schema validation failure', async () => {
  class RetryCoderRole implements AgentRole<{ task: string }, CodeExecutionOutput> {
    readonly name = 'coder' as const;
    private attempt = 0;

    async execute(): Promise<RoleResponse<CodeExecutionOutput>> {
      this.attempt += 1;
      if (this.attempt === 1) {
        return {
          role: 'coder',
          summary: 'invalid',
          output: { summary: 'missing changed' } as unknown as CodeExecutionOutput,
          warnings: [],
          risks: [],
          needsHumanDecision: false,
          confidence: 0.9,
        };
      }
      return makeCoderResponse('valid');
    }

    async validate(response: RoleResponse<CodeExecutionOutput>): Promise<void> {
      if (response.output.summary !== 'valid') {
        throw new Error('invalid response');
      }
    }
  }

  const { runner, config } = makeRunner();
  const response = await runner.execute(
    new RetryCoderRole(),
    {
      role: 'coder',
      objective: 'Execute task',
      input: { task: 'task-1' },
      acceptanceCriteria: ['done'],
    },
    makeContext(config),
  );

  assert.equal(response.output.summary, 'valid');
});

test('runWithTimeout surfaces step timeout details', async () => {
  await assert.rejects(
    () => runWithTimeout(async () => new Promise((resolve) => {
      setTimeout(() => {
        resolve('ok');
      }, 50);
    }), 10, 'timeout expected'),
    (error: unknown) => {
      assert.equal(error instanceof WorkflowPolicyError, true);
      const details = (error as WorkflowPolicyError).details as Record<string, unknown>;
      assert.equal(details.code, 'STEP_TIMEOUT');
      assert.equal(details.boundary, 'workflow_step');
      return true;
    },
  );
});
