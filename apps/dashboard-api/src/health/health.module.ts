import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { DashboardReadModelModule } from '../read-model/read-model.module.ts';
import { HealthController } from './health.controller.ts';
import { DashboardReadinessService } from './health.service.ts';

@Module({
  imports: [TerminusModule, DashboardReadModelModule],
  controllers: [HealthController],
  providers: [DashboardReadinessService],
})
// Nest uses declarative module marker classes here.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class HealthModule {}
