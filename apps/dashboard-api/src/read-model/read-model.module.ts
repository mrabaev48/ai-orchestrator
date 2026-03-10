import { Module } from '@nestjs/common';

import {
  DashboardQueryService,
  createStateStore,
} from '../../../../packages/application/src/index.ts';
import { createEmptyProjectState } from '../../../../packages/core/src/index.ts';
import type { StateStore } from '../../../../packages/state/src/index.ts';
import { DASHBOARD_CONFIG, STATE_STORE } from '../dashboard-api.tokens.ts';
import type { DashboardApiConfig } from '../config/dashboard-config.ts';

@Module({
  providers: [
    {
      provide: STATE_STORE,
      inject: [DASHBOARD_CONFIG],
      useFactory: (config: DashboardApiConfig): StateStore =>
        createStateStore(
          config.runtime,
          createEmptyProjectState({
            projectId: 'dashboard-api',
            projectName: 'Dashboard API',
            summary: 'Read-only dashboard query state',
          }),
        ),
    },
    {
      provide: DashboardQueryService,
      inject: [STATE_STORE],
      useFactory: (stateStore: StateStore): DashboardQueryService =>
        new DashboardQueryService(stateStore),
    },
  ],
  exports: [STATE_STORE, DashboardQueryService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardReadModelModule {}
