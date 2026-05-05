import { Module, type DynamicModule } from '@nestjs/common';

import { DashboardQueryModule } from './dashboard-query/dashboard-query.module.js';
import type { DashboardApiConfig } from './config/dashboard-config.js';
import { DashboardConfigModule } from './config/dashboard-config.module.js';
import { HealthModule } from './health/health.module.js';
import { DashboardReadModelModule } from './read-model/read-model.module.js';

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
