import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState, type BacklogTask } from '@ai-orchestrator/core';
import { InMemoryStateStore } from '@ai-orchestrator/state';
import type { RuntimeConfig } from '@ai-orchestrator/shared';

import type { WorkspaceManager } from '../workspace-manager.js';
import { PolicyDecisionRecorder } from '../persistence/policy-decision-recorder.js';
import { GitLifecycleCoordinator } from '../git/git-lifecycle-coordinator.js';
import { WorkspaceRunCoordinator } from './workspace-run-coordinator.js';

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
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeTask(): BacklogTask {
  return {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Implement runtime block',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };
}

test('WorkspaceRunCoordinator scopes tools and cleans up after success', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const task = makeTask();
  const store = new InMemoryStateStore(state);
  let isCleanedUp = false;
  const workspaceManager: WorkspaceManager = {
    allocate: async () => ({
      rootPath: process.cwd(),
      branchName: 'branch-1',
      initialDiff: '',
      rollback: async () => {},
      cleanup: async () => {
        isCleanedUp = true;
      },
    }),
  };
  const config = makeConfig();
  const gitLifecycleCoordinator = new GitLifecycleCoordinator({
    stateStore: store,
    config,
    policyDecisionRecorder: new PolicyDecisionRecorder(store),
  });
  const coordinator = new WorkspaceRunCoordinator({
    stateStore: store,
    config,
    workspaceManager,
    gitLifecycleCoordinator,
  });

  const result = await coordinator.run({
    state,
    task,
    runId: 'run-1',
    execute: async (context) => ({
      workspaceRoot: context.workspace.rootPath,
      toolPath: context.workspaceTools.fileSystem ? context.workspace.rootPath : 'missing',
    }),
  });

  assert.equal(result.workspaceRoot, process.cwd());
  assert.equal(result.toolPath, process.cwd());
  assert.equal(isCleanedUp, true);
  assert.equal(state.artifacts.some((artifact) => artifact.title.includes('Workspace initialized')), true);
  assert.equal(state.artifacts.some((artifact) => artifact.metadata.stage === 'branch'), true);
});

test('WorkspaceRunCoordinator rolls back and cleans up after failure', async () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const task = makeTask();
  const store = new InMemoryStateStore(state);
  let isRolledBack = false;
  let isCleanedUp = false;
  const workspaceManager: WorkspaceManager = {
    allocate: async () => ({
      rootPath: process.cwd(),
      initialDiff: '',
      rollback: async () => {
        isRolledBack = true;
      },
      cleanup: async () => {
        isCleanedUp = true;
      },
    }),
  };
  const config = makeConfig();
  const coordinator = new WorkspaceRunCoordinator({
    stateStore: store,
    config,
    workspaceManager,
    gitLifecycleCoordinator: new GitLifecycleCoordinator({
      stateStore: store,
      config,
      policyDecisionRecorder: new PolicyDecisionRecorder(store),
    }),
  });

  await assert.rejects(
    () => coordinator.run({
      state,
      task,
      runId: 'run-1',
      execute: async () => {
        throw new Error('boom');
      },
    }),
    /boom/,
  );

  assert.equal(isRolledBack, true);
  assert.equal(isCleanedUp, true);
});
