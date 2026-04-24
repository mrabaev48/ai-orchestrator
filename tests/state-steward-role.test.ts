import assert from 'node:assert/strict';
import test from 'node:test';

import { StateStewardRole } from '../packages/agents/src/index.ts';

test('StateStewardRole maps validation issues into repair guidance', async () => {
  const role = new StateStewardRole();

  const response = await role.execute(
    {
      role: 'state_steward',
      objective: 'Assess state integrity',
      input: {
        issues: [
          'Task task-1 depends on missing task missing-task',
          'Blocked task task-2 requires a failure or artifact record',
        ],
      },
      acceptanceCriteria: ['Return explainable integrity findings'],
    },
    {
      runId: 'run-1',
      role: 'state_steward',
      stateSummary: 'summary',
      toolProfile: {
        allowedWritePaths: [],
        canWriteRepo: false,
        canApproveChanges: false,
        canRunTests: false,
      },
      toolExecution: {
        policy: 'quality_gate',
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

  assert.equal(response.output.ok, false);
  assert.equal(response.output.findings[0]?.severity, 'high');
  assert.equal(response.output.findings[0]?.safeToAutoRepair, false);
});
