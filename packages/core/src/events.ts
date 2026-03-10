export type DomainEventType =
  | 'BOOTSTRAP_COMPLETED'
  | 'DISCOVERY_COMPLETED'
  | 'ARCHITECTURE_ANALYZED'
  | 'BACKLOG_PLANNED'
  | 'TASK_SPLIT'
  | 'TASK_SELECTED'
  | 'PROMPT_GENERATED'
  | 'ROLE_EXECUTED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'TEST_PASSED'
  | 'TEST_FAILED'
  | 'TASK_COMPLETED'
  | 'TASK_BLOCKED'
  | 'STATE_COMMITTED';

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
