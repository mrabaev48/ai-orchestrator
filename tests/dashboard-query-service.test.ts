import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardQueryService } from '../packages/application/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

test('DashboardQueryService returns state summary view from current state', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new DashboardQueryService(store);

  const summary = await service.getStateSummary();

  assert.equal(summary.projectId, 'project-1');
  assert.equal(summary.projectName, 'Project');
  assert.equal(summary.counts.tasks, 0);
});

test('DashboardQueryService returns backlog export view in both formats', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new DashboardQueryService(store);

  const exportView = await service.getBacklogExport();

  assert.match(exportView.markdown, /# Backlog export/);
  assert.equal(typeof exportView.json, 'string');
});
