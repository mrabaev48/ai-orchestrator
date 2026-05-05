import { Module } from '@nestjs/common';

import { DashboardReadModelModule } from '../read-model/read-model.module.js';
import { DashboardQueryController } from './dashboard-query.controller.js';
import { DashboardReadApiService } from './dashboard-query.service.js';

@Module({
  imports: [DashboardReadModelModule],
  controllers: [DashboardQueryController],
  providers: [DashboardReadApiService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardQueryModule {}
