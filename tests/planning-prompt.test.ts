import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPlanningPrompt } from '../packages/prompts/src/index.ts';
import {
  createEmptyProjectDiscovery,
  type ArchitectureFinding,
} from '../packages/core/src/index.ts';

test('buildPlanningPrompt exposes milestone-aware backlog schema', () => {
  const discovery = createEmptyProjectDiscovery();
  discovery.packageInventory = ['packages/application'];

  const findings: ArchitectureFinding[] = [
    {
      subsystem: 'runtime',
      issueType: 'critical_path_gap',
      description: 'Critical runtime path spans multiple packages',
      impact: 'Changes can regress across package boundaries',
      recommendation: 'Harden contracts',
      affectedModules: ['packages/application'],
      severity: 'high',
    },
  ];

  const prompt = buildPlanningPrompt(discovery, findings);

  assert.equal(prompt.role, 'planner');
  assert.match(prompt.taskPrompt, /Architecture findings: 1/);
  assert.deepEqual(prompt.outputSchema.required, ['milestone', 'backlog', 'summary']);
});
