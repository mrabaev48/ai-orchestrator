import { Global, Module, type DynamicModule } from '@nestjs/common';

import { DASHBOARD_CONFIG } from '../dashboard-api.tokens.js';
import type { DashboardApiConfig } from './dashboard-config.js';

@Global()
@Module({})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardConfigModule {
  static register(config: DashboardApiConfig): DynamicModule {
    return {
      module: DashboardConfigModule,
      providers: [
        {
          provide: DASHBOARD_CONFIG,
          useValue: config,
        },
      ],
      exports: [DASHBOARD_CONFIG],
    };
  }
}
