import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import type { DomainEventType } from '../../../../packages/core/src/index.ts';

export class BacklogExportQueryDto {
  @IsOptional()
  @IsIn(['json', 'md'])
  format?: 'json' | 'md';
}

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

export class EventHistoryQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsString()
  @IsIn([
    'BOOTSTRAP_COMPLETED',
    'DISCOVERY_COMPLETED',
    'ARCHITECTURE_ANALYZED',
    'BACKLOG_PLANNED',
    'TASK_SPLIT',
    'RELEASE_ASSESSED',
    'STATE_INTEGRITY_CHECKED',
    'EXPORT_PREPARED',
    'TASK_SELECTED',
    'PROMPT_GENERATED',
    'ROLE_EXECUTED',
    'APPROVAL_REQUESTED',
    'APPROVAL_APPROVED',
    'APPROVAL_REJECTED',
    'APPROVAL_RESUMED',
    'REVIEW_APPROVED',
    'REVIEW_REJECTED',
    'TEST_PASSED',
    'TEST_FAILED',
    'TASK_COMPLETED',
    'TASK_BLOCKED',
    'STATE_COMMITTED',
  ])
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


export class AuditExportQueryDto extends HistoryQueryDto {
  @IsOptional()
  @IsIn(['json'])
  format?: 'json';
}
