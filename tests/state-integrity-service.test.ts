import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StateIntegrityService,
} from '@ai-orchestrator/application';
import {
  createEmptyProjectState,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type ProjectState,
} from '@ai-orchestrator/core';
import { createLogger, type RuntimeConfig } from '@ai-orchestrator/shared';
import type { RecordFailureInput, StateStore } from '@ai-orchestrator/state';
import { createTestApplicationRoleRegistry } from './support/application-role-registry.js';

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
      level: 'error',
      format: 'json',
    },
  };
}

test('StateIntegrityService persists explainable integrity report for invalid state', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Task',
    kind: 'implementation',
    status: 'blocked',
    priority: 'p1',
    dependsOn: ['missing-task'],
    acceptanceCriteria: ['works'],
    affectedModules: ['packages/core'],
    estimatedRisk: 'medium',
  };
  state.execution.blockedTaskIds.push('task-1');

  const events: DomainEvent[] = [];
  const artifacts: ArtifactRecord[] = [];
  const store: StateStore = {
    load: async () => structuredClone(state),
    save: async (nextState: ProjectState) => {
      nextState.revision += 1;
      return { revision: nextState.revision };
    },
    saveWithEvents: async (nextState: ProjectState, nextEvents: readonly DomainEvent[]) => {
      nextState.revision += 1;
      events.push(...nextEvents);
      return { revision: nextState.revision };
    },
    listEvents: async () => [],
    listRunSteps: async () => [],
    recordEvent: async (event: DomainEvent) => {
      events.push(event);
    },
    recordFailure: async (input: RecordFailureInput) => {
      void input;
      throw new Error('not needed');
    },
    recordArtifact: async (artifact: ArtifactRecord) => {
      artifacts.push(artifact);
      return { revision: state.revision };
    },
    recordDecision: async (decision: DecisionLogItem) => {
      void decision;
      return { revision: state.revision };
    },
    recordRunStep: async () => ({ revision: state.revision }),
    recordPolicyDecision: async () => ({ revision: state.revision }),
    getPolicyDecision: async () => null,
    markTaskDone: async (taskId: string, summary: string) => {
      void taskId;
      void summary;
      return { revision: state.revision };
    },
  };
  const report = await new StateIntegrityService(
    store,
    createTestApplicationRoleRegistry(),
    createLogger(makeRuntimeConfig(), { sink: () => {} }),
  ).inspect();

  assert.equal(report.ok, false);
  assert.ok(report.findings.length >= 1);
  assert.equal(events.some((event) => event.eventType === 'STATE_INTEGRITY_CHECKED'), true);
  assert.equal(artifacts.some((artifact) => artifact.type === 'state_integrity_report'), true);
});
