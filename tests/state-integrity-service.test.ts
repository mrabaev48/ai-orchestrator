import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StateIntegrityService,
  createRoleRegistry,
} from '../packages/application/src/index.ts';
import {
  createEmptyProjectState,
  type ArtifactRecord,
  type DecisionLogItem,
  type DomainEvent,
  type FailureRecord,
  type ProjectState,
} from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import type { RecordFailureInput, StateStore } from '../packages/state/src/StateStore.ts';

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
      void nextState;
    },
    listEvents: async () => [],
    recordEvent: async (event: DomainEvent) => {
      events.push(event);
    },
    recordFailure: async (input: RecordFailureInput): Promise<FailureRecord> => {
      void input;
      throw new Error('not needed');
    },
    recordArtifact: async (artifact: ArtifactRecord) => {
      artifacts.push(artifact);
    },
    recordDecision: async (decision: DecisionLogItem) => {
      void decision;
    },
    markTaskDone: async (taskId: string, summary: string) => {
      void taskId;
      void summary;
    },
  };
  const report = await new StateIntegrityService(
    store,
    createRoleRegistry(),
    createLogger(makeRuntimeConfig(), { sink: () => {} }),
  ).inspect();

  assert.equal(report.ok, false);
  assert.ok(report.findings.length >= 1);
  assert.equal(events.some((event) => event.eventType === 'STATE_INTEGRITY_CHECKED'), true);
  assert.equal(artifacts.some((artifact) => artifact.type === 'state_integrity_report'), true);
});
