import assert from 'node:assert/strict';
import test from 'node:test';

import { ReleaseAuditorRole } from '../packages/agents/src/index.ts';

test('ReleaseAuditorRole classifies blockers and warnings into a structured verdict', async () => {
  const role = new ReleaseAuditorRole();

  const response = await role.execute(
    {
      role: 'release_auditor',
      objective: 'Assess release readiness',
      input: {
        blockers: ['Repository tests are failing'],
        warnings: ['Documentation artifact is missing'],
        evidence: ['Repo health: tests=failing'],
      },
      acceptanceCriteria: ['Return structured release assessment'],
    },
    {
      runId: 'run-1',
      role: 'release_auditor',
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

  assert.equal(response.output.verdict, 'blocked');
  assert.equal(response.output.recommendedNextActions[0], 'Resolve blocker: Repository tests are failing');
});
