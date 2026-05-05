import { createHash } from 'node:crypto';

import { canonicalizeEvidencePayload } from '../../../core/src/evidence/run-step-evidence.ts';
import type { DomainEvent } from '../../../core/src/events.ts';

export interface ImmutableAuditRecord {
  readonly index: number;
  readonly eventId: string;
  readonly createdAt: string;
  readonly checksum: string;
  readonly previousChecksum: string | null;
  readonly eventType: string;
  readonly runId: string | null;
  readonly payload: unknown;
}

export function buildImmutableAuditLog(events: readonly DomainEvent[]): ImmutableAuditRecord[] {
  let previousChecksum: string | null = null;

  return events
    .slice()
    .sort((l, r) => l.createdAt.localeCompare(r.createdAt))
    .map((event, index) => {
      const checksum = createChecksum({ event, index, previousChecksum });
      const record: ImmutableAuditRecord = {
        index,
        eventId: event.id,
        createdAt: event.createdAt,
        checksum,
        previousChecksum,
        eventType: event.eventType,
        runId: event.runId ?? null,
        payload: event.payload,
      };
      previousChecksum = checksum;
      return record;
    });
}

function createChecksum(input: { event: DomainEvent; index: number; previousChecksum: string | null }): string {
  return createHash('sha256')
    .update(
      canonicalizeEvidencePayload({
        index: input.index,
        id: input.event.id,
        createdAt: input.event.createdAt,
        eventType: input.event.eventType,
        runId: input.event.runId ?? null,
        previousChecksum: input.previousChecksum,
        payload: input.event.payload,
      }),
    )
    .digest('hex');
}
