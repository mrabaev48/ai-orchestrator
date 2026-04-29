import assert from 'node:assert/strict';
import test from 'node:test';

import { PlannerRole } from '../packages/agents/src/index.ts';
import { buildMergePreview } from '../packages/agents/src/default-roles.ts';
import { createEmptyProjectDiscovery, type ArchitectureFinding } from '../packages/core/src/index.ts';

test('PlannerRole produces milestone-aware backlog with dependencies and acceptance criteria', async () => {
  const role = new PlannerRole();
  const discovery = createEmptyProjectDiscovery();
  discovery.packageInventory = ['apps/control-plane', 'packages/application'];

  const findings: ArchitectureFinding[] = [
    {
      subsystem: 'runtime',
      issueType: 'critical_path_gap',
      description: 'Critical runtime path spans multiple packages',
      impact: 'Changes can regress across package boundaries',
      recommendation: 'Harden contracts',
      affectedModules: ['packages/application', 'packages/execution'],
      severity: 'high',
    },
    {
      subsystem: 'module_boundaries',
      issueType: 'contract_instability',
      description: 'Direct source imports cross package boundaries',
      impact: 'Refactors break internal imports',
      recommendation: 'Use package entrypoints',
      affectedModules: ['apps/control-plane/src/cli.ts'],
      severity: 'medium',
    },
  ];

  const response = await role.execute(
    {
      role: 'planner',
      objective: 'Plan backlog',
      input: { discovery, findings },
      acceptanceCriteria: ['Return structured backlog updates'],
    },
    {
      runId: 'run-1',
      role: 'planner',
      stateSummary: 'summary',
      toolProfile: {
        allowedWritePaths: [],
        canWriteRepo: false,
        canApproveChanges: false,
        canRunTests: false,
      },
      toolExecution: {
        policy: 'read_only_analysis',
        permissionScope: 'read_only',
        workspaceRoot: process.cwd(),
        evidenceSource: 'state_snapshot',
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        withContext: () => {
          throw new Error('not needed');
        },
      },
    },
  );

  role.validate?.(response);

  const tasks = Object.values(response.output.backlog.tasks);
  assert.equal(response.output.milestone.status, 'in_progress');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.priority, 'p1');
  assert.equal(tasks[1]?.dependsOn.length, 1);
  assert.equal(tasks.every((task) => task.acceptanceCriteria.length > 0), true);
  assert.equal(response.output.dependencyEdges.some((edge) => edge.type === 'depends_on'), true);
  assert.equal(response.output.assumptions.length > 0, true);
  assert.equal(response.output.risks.length, 2);
  assert.equal(response.output.mergePreview.batches.length, 2);
});

test('PlannerRole validation fails when normalized graph metadata is missing', () => {
  const role = new PlannerRole();

  assert.throws(
    () => {
      role.validate?.({
        role: 'planner',
        summary: 'invalid',
        output: {
          milestone: {
            id: 'm-1',
            title: 'Milestone',
            goal: 'Goal',
            status: 'in_progress',
            epicIds: ['epic-1'],
            entryCriteria: ['start'],
            exitCriteria: ['finish'],
          },
          backlog: {
            epics: {
              'epic-1': {
                id: 'epic-1',
                title: 'Epic',
                goal: 'Goal',
                status: 'todo',
                featureIds: ['feature-1'],
              },
            },
            features: {
              'feature-1': {
                id: 'feature-1',
                epicId: 'epic-1',
                title: 'Feature',
                outcome: 'Outcome',
                risks: [],
                taskIds: ['task-1'],
              },
            },
            tasks: {
              'task-1': {
                id: 'task-1',
                featureId: 'feature-1',
                title: 'Task',
                kind: 'architecture',
                status: 'todo',
                priority: 'p1',
                dependsOn: [],
                acceptanceCriteria: ['Done'],
                affectedModules: ['packages/application'],
                estimatedRisk: 'medium',
              },
            },
          },
          summary: 'summary',
          dependencyEdges: [],
          assumptions: [],
          risks: [],
          mergePreview: { batches: [], notes: [] },
        },
        warnings: [],
        risks: [],
        needsHumanDecision: false,
        confidence: 0.9,
      });
    },
    /dependency edges/,
  );
});

test('buildMergePreview groups cyclic dependencies into a fallback batch', () => {
  const preview = buildMergePreview({
    'task-a': {
      id: 'task-a',
      featureId: 'feature-1',
      title: 'Task A',
      kind: 'implementation',
      status: 'todo',
      priority: 'p1',
      dependsOn: ['task-b'],
      acceptanceCriteria: ['done'],
      affectedModules: ['packages/a'],
      estimatedRisk: 'medium',
    },
    'task-b': {
      id: 'task-b',
      featureId: 'feature-1',
      title: 'Task B',
      kind: 'implementation',
      status: 'todo',
      priority: 'p1',
      dependsOn: ['task-a'],
      acceptanceCriteria: ['done'],
      affectedModules: ['packages/b'],
      estimatedRisk: 'medium',
    },
  });

  assert.deepEqual(preview.batches, [
    {
      id: 'batch-1',
      taskIds: ['task-a', 'task-b'],
      rationale: 'Fallback batch: cyclic or unresolved dependencies require manual review.',
    },
  ]);
  assert.equal(
    preview.notes.some((note) => note.includes('Fallback batch created for unresolved dependency graph')),
    true,
  );
});
