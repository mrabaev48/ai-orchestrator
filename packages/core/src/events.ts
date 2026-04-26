export type DomainEventType =
  | 'BOOTSTRAP_COMPLETED'
  | 'DISCOVERY_COMPLETED'
  | 'ARCHITECTURE_ANALYZED'
  | 'BACKLOG_PLANNED'
  | 'TASK_SPLIT'
  | 'RELEASE_ASSESSED'
  | 'STATE_INTEGRITY_CHECKED'
  | 'EXPORT_PREPARED'
  | 'TASK_SELECTED'
  | 'PROMPT_GENERATED'
  | 'ROLE_EXECUTED'
  | 'ROLE_TOOL_REQUESTED'
  | 'ROLE_OBSERVATION_RECORDED'
  | 'TOOL_EVIDENCE_RECORDED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'TEST_PASSED'
  | 'TEST_FAILED'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'STATE_COMMITTED'
  | 'METRIC_RECORDED';

export interface DomainEvent<TPayload = Record<string, unknown>> {
  id: string;
  eventType: DomainEventType;
  createdAt: string;
  payload: TPayload;
  runId?: string;
}

export function makeEvent<TPayload>(
  eventType: DomainEventType,
  payload: TPayload,
  context: { runId?: string } = {},
): DomainEvent<TPayload> {
  return {
    id: crypto.randomUUID(),
    eventType,
    createdAt: new Date().toISOString(),
    payload,
    ...(context.runId ? { runId: context.runId } : {}),
  };
}
