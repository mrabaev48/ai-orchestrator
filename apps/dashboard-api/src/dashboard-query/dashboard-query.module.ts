import { Module } from '@nestjs/common';

import { DashboardReadModelModule } from '../read-model/read-model.module.ts';
import { DashboardQueryController } from './dashboard-query.controller.ts';
import { DashboardReadApiService } from './dashboard-query.service.ts';

@Module({
  imports: [DashboardReadModelModule],
  controllers: [DashboardQueryController],
  providers: [DashboardReadApiService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class DashboardQueryModule {}
