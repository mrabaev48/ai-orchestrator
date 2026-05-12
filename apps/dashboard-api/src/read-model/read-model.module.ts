import { Module } from '@nestjs/common';

import {
  ApprovalGateService,
  DEFAULT_READINESS_SCORECARD_POLICY,
  DashboardQueryService,
} from '@ai-orchestrator/application';
import { createEmptyProjectState } from '@ai-orchestrator/core';
import { createObservabilityStore, createStateStore } from '@ai-orchestrator/runtime';
import type { ObservabilityStore, StateStore } from '@ai-orchestrator/state';
import { DASHBOARD_CONFIG, OBSERVABILITY_STORE, STATE_STORE } from '../dashboard-api.tokens.js';
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
            projectId: config.project.projectId,
            projectName: config.project.projectName,
            summary: config.project.summary,
          }),
        ),
    },
    {
      provide: OBSERVABILITY_STORE,
      inject: [DASHBOARD_CONFIG],
      useFactory: (config: DashboardApiConfig): ObservabilityStore =>
        createObservabilityStore(
          config.runtime,
          createEmptyProjectState({
            projectId: config.project.projectId,
            projectName: config.project.projectName,
            summary: config.project.summary,
          }),
        ),
    },
    {
      provide: DashboardQueryService,
      inject: [STATE_STORE, DASHBOARD_CONFIG, OBSERVABILITY_STORE],
      useFactory: (
        stateStore: StateStore,
        config: DashboardApiConfig,
        observabilityStore: ObservabilityStore,
      ): DashboardQueryService =>
        new DashboardQueryService(stateStore, config.runtime.workflow.readinessScorecardPolicy
          ? {
            id: config.runtime.workflow.readinessScorecardPolicy.id,
            passThresholdPercent: config.runtime.workflow.readinessScorecardPolicy.passThresholdPercent,
            enabledCriteria: new Set(config.runtime.workflow.readinessScorecardPolicy.enabledCriteria),
          }
          : DEFAULT_READINESS_SCORECARD_POLICY,
        observabilityStore),
    },
    {
      provide: ApprovalGateService,
      inject: [STATE_STORE],
      useFactory: (stateStore: StateStore): ApprovalGateService => new ApprovalGateService(stateStore),
    },
  ],
  exports: [STATE_STORE, OBSERVABILITY_STORE, DashboardQueryService, ApprovalGateService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardReadModelModule {}
