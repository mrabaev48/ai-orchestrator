import type { StateStore } from '../../state/src/index.ts';
import type {
  ArtifactHistoryItemView,
  BacklogExportView,
  BacklogView,
  DashboardStateView,
  DecisionHistoryItemView,
  EventHistoryItemView,
  FailureHistoryItemView,
  LatestRunSummaryView,
  MilestoneListItemView,
  PaginatedView,
} from './read-models.ts';
import {
  toArtifactHistoryView,
  toBacklogExportView,
  toBacklogView,
  toDashboardStateView,
  toDecisionHistoryView,
  toEventHistoryView,
  toFailureHistoryView,
  toLatestRunSummaryView,
  toMilestoneListView,
} from './read-models.ts';

export interface HistoryQueryInput {
  limit?: number;
  offset?: number;
}

export interface EventHistoryQueryInput extends HistoryQueryInput {
  eventType?: NonNullable<Parameters<StateStore['listEvents']>[0]>['eventType'];
}

export interface FailureHistoryQueryInput extends HistoryQueryInput {
  taskId?: string;
}

export interface ArtifactHistoryQueryInput extends HistoryQueryInput {
  type?: string;
}

export class DashboardQueryService {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  async getStateSummary(): Promise<DashboardStateView> {
    const state = await this.stateStore.load();
    return toDashboardStateView(state);
  }

  async getMilestones(): Promise<MilestoneListItemView[]> {
    const state = await this.stateStore.load();
    return toMilestoneListView(state);
  }

  async getBacklog(): Promise<BacklogView> {
    const state = await this.stateStore.load();
    return toBacklogView(state.backlog);
  }

  async getBacklogExport(): Promise<BacklogExportView> {
    const state = await this.stateStore.load();
    return toBacklogExportView(state);
  }

  async getEvents(query: EventHistoryQueryInput = {}): Promise<PaginatedView<EventHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const events = await this.stateStore.listEvents({
      limit,
      offset,
      ...(query.eventType ? { eventType: query.eventType } : {}),
    });

    return toEventHistoryView(events, {
      total: events.length,
      limit,
      offset,
    });
  }

  async getFailures(query: FailureHistoryQueryInput = {}): Promise<PaginatedView<FailureHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const filtered = applyPagination(
      [...state.failures]
        .filter((failure) => (query.taskId ? failure.taskId === query.taskId : true))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toFailureHistoryView(filtered, {
      total: filtered.length,
      limit,
      offset,
    });
  }

  async getDecisions(query: HistoryQueryInput = {}): Promise<PaginatedView<DecisionHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const decisions = applyPagination(
      [...state.decisions].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toDecisionHistoryView(decisions, {
      total: decisions.length,
      limit,
      offset,
    });
  }

  async getArtifacts(
    query: ArtifactHistoryQueryInput = {},
  ): Promise<PaginatedView<ArtifactHistoryItemView>> {
    const { limit, offset } = normalizeHistoryQuery(query);
    const state = await this.stateStore.load();
    const artifacts = applyPagination(
      [...state.artifacts]
        .filter((artifact) => (query.type ? artifact.type === query.type : true))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      offset,
      limit,
    );

    return toArtifactHistoryView(artifacts, {
      total: artifacts.length,
      limit,
      offset,
    });
  }

  async getLatestRunSummary(): Promise<LatestRunSummaryView | null> {
    const state = await this.stateStore.load();
    return toLatestRunSummaryView(state);
  }
}

function normalizeHistoryQuery(query: HistoryQueryInput): Required<HistoryQueryInput> {
  return {
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
  };
}

function applyPagination<TItem>(items: TItem[], offset: number, limit: number): TItem[] {
  return items.slice(offset, offset + limit);
}
