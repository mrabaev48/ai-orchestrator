import assert from 'node:assert/strict';
import test from 'node:test';

import { DocsWriterRole } from '../packages/agents/src/index.ts';

test('DocsWriterRole produces bounded markdown documentation output', async () => {
  const role = new DocsWriterRole();

  const response = await role.execute(
    {
      role: 'docs_writer',
      objective: 'Generate documentation summary',
      input: {
        projectName: 'Project',
        summary: 'State summary',
        affectedModules: ['packages/application', 'packages/execution'],
        behaviorChanges: ['Backlog planning added'],
        designRationale: ['Runtime boundaries were hardened'],
        followUpGaps: ['No dashboard API yet'],
      },
      acceptanceCriteria: ['Return reviewable markdown'],
    },
    {
      runId: 'run-1',
      role: 'docs_writer',
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

  assert.match(response.output.markdown, /# Project update summary/);
  assert.equal(response.output.affectedModules.length, 2);
});
