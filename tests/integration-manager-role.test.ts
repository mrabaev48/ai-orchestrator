import assert from 'node:assert/strict';
import test from 'node:test';

import { IntegrationManagerRole } from '../packages/agents/src/index.ts';

test('IntegrationManagerRole produces export-ready payloads with blockers and traceability', async () => {
  const role = new IntegrationManagerRole();

  const response = await role.execute(
    {
      role: 'integration_manager',
      objective: 'Prepare export',
      input: {
        mappedEntities: [
          {
            entityType: 'task',
            internalId: 'task-1',
            title: 'Task',
            status: 'todo',
            dependencies: ['task-0'],
            acceptanceCriteria: ['done'],
            affectedModules: ['packages/core'],
            traceability: { featureId: 'feature-1' },
          },
        ],
        missingRequiredFields: ['task:task-1:externalProjectKey'],
        exportBlockers: ['Blocked tasks present: task-9'],
      },
      acceptanceCriteria: ['Return deterministic export payload'],
    },
    {
      runId: 'run-1',
      role: 'integration_manager',
      stateSummary: 'summary',
      toolProfile: {
        allowedWritePaths: [],
        canWriteRepo: false,
        canApproveChanges: false,
        canRunTests: false,
      },
      toolExecution: {
        policy: 'orchestrator_default',
        permissionScope: 'repo_write',
        workspaceRoot: process.cwd(),
        evidenceSource: 'artifacts',
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

  assert.equal(response.output.integrationTarget, 'generic_json');
  assert.equal(response.output.mappedEntities.length, 1);
  assert.equal(response.output.recommendedFixes.length, 2);
});
