import { Module } from '@nestjs/common';

import {
  ApprovalGateService,
  DEFAULT_READINESS_SCORECARD_POLICY,
  DashboardQueryService,
  createStateStore,
} from '@ai-orchestrator/application';
import { createEmptyProjectState } from '@ai-orchestrator/core';
import type { StateStore } from '@ai-orchestrator/state';
import { DASHBOARD_CONFIG, STATE_STORE } from '../dashboard-api.tokens.js';
import type { DashboardApiConfig } from '../config/dashboard-config.js';

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
      inject: [STATE_STORE, DASHBOARD_CONFIG],
      useFactory: (stateStore: StateStore, config: DashboardApiConfig): DashboardQueryService =>
        new DashboardQueryService(stateStore, config.runtime.workflow.readinessScorecardPolicy
          ? {
            id: config.runtime.workflow.readinessScorecardPolicy.id,
            passThresholdPercent: config.runtime.workflow.readinessScorecardPolicy.passThresholdPercent,
            enabledCriteria: new Set(config.runtime.workflow.readinessScorecardPolicy.enabledCriteria),
          }
          : DEFAULT_READINESS_SCORECARD_POLICY),
    },
    {
      provide: ApprovalGateService,
      inject: [STATE_STORE],
      useFactory: (stateStore: StateStore): ApprovalGateService => new ApprovalGateService(stateStore),
    },
  ],
  exports: [STATE_STORE, DashboardQueryService, ApprovalGateService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardReadModelModule {}
