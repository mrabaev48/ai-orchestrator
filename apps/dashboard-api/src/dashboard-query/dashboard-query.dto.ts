import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '@ai-orchestrator/core';

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class BacklogExportQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsIn(['json', 'md'])
  format?: 'json' | 'md';
}

export class EventHistoryQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(DOMAIN_EVENT_TYPES)
  eventType?: DomainEventType;
}

export class FailureHistoryQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  taskId?: string;
}

export class ArtifactHistoryQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([
    'bootstrap_analysis',
    'architecture_analysis',
    'documentation',
    'release_assessment',
    'state_integrity_report',
    'integration_export',
    'optimized_prompt',
    'run_summary',
    'backlog_export',
    'plan',
    'test_plan',
    'report',
  ])
  type?: string;
}

export class ApprovalHistoryQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'approved', 'rejected', 'resumed', 'completed'])
  status?: 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed';
}

export class ApprovalDecisionBodyDto {
  @IsString()
  actor!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class RunStepEvidenceQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  taskId?: string;
}



export class TraceAuditQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  toolName?: string;

  @IsOptional()
  @IsIn(['ok', 'error'])
  status?: 'ok' | 'error';
}

export class AuditExportQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsIn(['json'])
  format?: 'json';
}
