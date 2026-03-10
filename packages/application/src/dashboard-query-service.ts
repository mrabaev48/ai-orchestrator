import type { StateStore } from '../../state/src/index.ts';
import type { BacklogExportView, StateSummaryView } from './read-models.ts';
import { toBacklogExportView, toStateSummaryView } from './read-models.ts';

export class DashboardQueryService {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  async getStateSummary(): Promise<StateSummaryView> {
    const state = await this.stateStore.load();
    return toStateSummaryView(state);
  }

  async getBacklogExport(): Promise<BacklogExportView> {
    const state = await this.stateStore.load();
    return toBacklogExportView(state);
  }
}
