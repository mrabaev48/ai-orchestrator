import test from 'node:test';
import assert from 'node:assert/strict';

import { PromptPipeline } from '../packages/prompts/src/index.ts';

test('PromptPipeline injects acceptance criteria and failure constraints', () => {
  const pipeline = new PromptPipeline();
  const prompt = pipeline.build({
    role: 'coder',
    task: {
      id: 'task-1',
      featureId: 'feature-1',
      title: 'Implement feature',
      kind: 'implementation',
      status: 'todo',
      priority: 'p1',
      dependsOn: [],
      acceptanceCriteria: ['works end-to-end'],
      affectedModules: ['packages/core'],
      estimatedRisk: 'medium',
    },
    stateSummary: 'project=Demo',
    failures: [
      {
        id: 'failure-1',
        taskId: 'task-1',
        role: 'reviewer',
        reason: 'missing tests',
        symptoms: [],
        badPatterns: [],
        retrySuggested: true,
        createdAt: new Date().toISOString(),
      },
    ],
    outputSchema: { type: 'object' },
  });

  assert.equal(prompt.role, 'coder');
  assert.match(prompt.constraints.join('\n'), /Acceptance: works end-to-end/);
  assert.match(prompt.constraints.join('\n'), /Avoid repeating failure: missing tests/);
});
