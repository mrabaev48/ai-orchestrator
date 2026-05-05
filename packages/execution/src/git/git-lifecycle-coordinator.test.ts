import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '@ai-orchestrator/core';
import { InMemoryStateStore } from '@ai-orchestrator/state';
import type { RuntimeConfig } from '@ai-orchestrator/shared';

import { PolicyDecisionRecorder } from '../persistence/policy-decision-recorder.js';
import { GitLifecycleCoordinator } from './git-lifecycle-coordinator.js';

function makeConfig(approvalGateMode: 'enabled' | 'disabled' = 'disabled'): RuntimeConfig {
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
      approvalGateMode,
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

function makeCoordinator(input: {
  approvalGateMode?: 'enabled' | 'disabled';
  workspaceHasGitChanges: boolean;
  createCommit?: () => Promise<{ ok: true; commitSha: string } | { ok: false }>;
  pushBranch?: () => Promise<boolean>;
  readCommitNameStatus?: () => Promise<string[]>;
}) {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const coordinator = new GitLifecycleCoordinator({
    stateStore: store,
    config: makeConfig(input.approvalGateMode ?? 'disabled'),
    policyDecisionRecorder: new PolicyDecisionRecorder(store),
    executors: {
      workspaceHasGitChanges: async () => input.workspaceHasGitChanges,
      currentGitBranch: async () => 'branch-1',
      createCommit: input.createCommit,
      pushBranch: input.pushBranch,
      createPullRequestDraft: async () => true,
      readCommitNameStatus: input.readCommitNameStatus,
    },
  });
  return { coordinator, state };
}

test('GitLifecycleCoordinator records skipped artifacts when workspace has no changes', async () => {
  const { coordinator, state } = makeCoordinator({ workspaceHasGitChanges: false });

  const status = await coordinator.complete({
    state,
    runId: 'run-1',
    taskId: 'task-1',
    taskTitle: 'Title',
    workspaceRoot: process.cwd(),
  });

  assert.equal(status, 'ok');
  assert.equal(
    state.artifacts.some((artifact) =>
      artifact.type === 'git_lifecycle'
      && artifact.metadata.stage === 'commit'
      && artifact.metadata.commitStatus === 'skipped_no_changes'
    ),
    true,
  );
});

test('GitLifecycleCoordinator marks approval pending before push', async () => {
  const { coordinator, state } = makeCoordinator({
    approvalGateMode: 'enabled',
    workspaceHasGitChanges: true,
    createCommit: async () => ({ ok: true, commitSha: 'abc123' }),
    pushBranch: async () => true,
  });

  const status = await coordinator.complete({
    state,
    runId: 'run-1',
    taskId: 'task-1',
    taskTitle: 'Title',
    workspaceRoot: process.cwd(),
  });

  assert.equal(status, 'approval_pending');
  assert.equal(state.approvals.some((approval) => approval.requestedAction === 'git_push'), true);
  assert.equal(
    state.artifacts.some((artifact) =>
      artifact.type === 'git_lifecycle'
      && artifact.metadata.stage === 'commit'
      && artifact.metadata.pushStatus === 'pending_approval'
    ),
    true,
  );
});

test('GitLifecycleCoordinator suppresses duplicate commit side effect', async () => {
  let commitCount = 0;
  const { coordinator, state } = makeCoordinator({
    workspaceHasGitChanges: true,
    createCommit: async () => {
      commitCount += 1;
      return { ok: true, commitSha: `commit-${commitCount}` };
    },
    pushBranch: async () => false,
  });
  const input = {
    state,
    runId: 'run-1',
    taskId: 'task-1',
    taskTitle: 'Title',
    workspaceRoot: process.cwd(),
  };

  await coordinator.complete(input);
  await coordinator.complete(input);

  assert.equal(commitCount, 1);
  assert.equal(
    state.artifacts.some((artifact) =>
      artifact.type === 'git_lifecycle'
      && artifact.metadata.stage === 'commit'
      && artifact.metadata.commitStatus === 'skipped_duplicate'
    ),
    true,
  );
});
