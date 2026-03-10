import { Module, type DynamicModule } from '@nestjs/common';

import { DashboardQueryModule } from './dashboard-query/dashboard-query.module.ts';
import type { DashboardApiConfig } from './config/dashboard-config.ts';
import { DashboardConfigModule } from './config/dashboard-config.module.ts';
import { HealthModule } from './health/health.module.ts';
import { DashboardReadModelModule } from './read-model/read-model.module.ts';

@Module({
  imports: [DashboardReadModelModule, HealthModule, DashboardQueryModule],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardApiModule {}

export function createDashboardApiRootModule(config: DashboardApiConfig): DynamicModule {
  return {
    module: DashboardApiModule,
    imports: [DashboardConfigModule.register(config)],
  };
}
