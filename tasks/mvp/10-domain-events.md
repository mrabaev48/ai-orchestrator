# 10 — Domain events (typing + catalog)

## Goal

Define the domain event model and the event type catalog for MVP to enable auditability, debugging, and building run history/reporting.

## Context and business logic

The event log is a required part of the persistence strategy alongside snapshots. At important execution steps, the orchestrator must emit events rather than relying only on logging.

## Requirements

### Functional

- `DomainEvent` type:
  - `id`, `eventType`, `createdAt`, `payload`, `runId?`
- Event type catalog (MVP minimum):
  - `BOOTSTRAP_COMPLETED`
  - `TASK_SELECTED`
  - `PROMPT_GENERATED`
  - `ROLE_EXECUTED`
  - `REVIEW_APPROVED` / `REVIEW_REJECTED`
  - `TEST_PASSED` / `TEST_FAILED`
  - `TASK_COMPLETED`
  - `TASK_BLOCKED` (if applicable)
- Event policy: events are recorded at the stages listed in the policy.

### Non-functional

- Payload is serializable JSON and contains no secrets.
- Events complement (do not replace) snapshots.

## Stack

- TypeScript
- PostgreSQL (table `domain_events`)

## Implementation details

- `packages/core/events/*`:
  - `DomainEvent` + `DomainEventType` (string union/enum)
  - `makeEvent(type, payload, ctx)` — factory (sets id/time/runId)
- `packages/state`:
  - `recordEvent(event)` writes to `domain_events` and/or buffers until commit

## Definition of Done (DoD)

- `run-cycle` records at minimum: task_selected, prompt_generated, role_executed, review/test events, state_committed/task_completed (depending on outcome).

## Test plan

- Unit: payload serialization + event type catalog
- Integration: happy path run produces the expected sequence of events

## Documentation links

- Spec v3: Event policy (что записывать): [`docs/ai-orchestrator-spec-v3.md` §10.5](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Required event types: [`docs/ai-orchestrator-spec-v3.md` §22.3](../../docs/ai-orchestrator-spec-v3.md)

