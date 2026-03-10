import { Inject, Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';

import type { StateStore } from '../../../../packages/state/src/index.ts';
import { STATE_STORE } from '../dashboard-api.tokens.ts';

@Injectable()
export class DashboardReadinessService {
  private readonly stateStore: StateStore;

  constructor(@Inject(STATE_STORE) stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  async checkStateStore(): Promise<HealthIndicatorResult> {
    const state = await this.stateStore.load();

    return {
      stateStore: {
        status: 'up',
        projectId: state.projectId,
      },
    };
  }
}
