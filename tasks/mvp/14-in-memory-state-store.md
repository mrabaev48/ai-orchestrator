# 14 — In-memory StateStore

## Goal

Build an in-memory implementation of `StateStore` for tests, local debugging, and deterministic runs without SQLite.

## Context and business logic

The MVP must include an in-memory store as a safe way to test workflow and agents without “real” persistence. This simplifies unit/integration tests for runCycle.

## Requirements

### Functional

- Implements the full `StateStore` contract.
- Stores:
  - the current `ProjectState`
  - a list of `DomainEvent[]`
  - `FailureRecord[]` (may be part of the state)
- Supports initializing an “empty” baseline state (bootstrap baseline) or loading from a prepared state fixture.

### Non-functional

- Determinism: methods do not depend on external factors.

## Stack

- TypeScript

## Implementation details

- `packages/state/inMemory/InMemoryStateStore.ts`
- Important:
  - do not replace business rules: the store must not decide transitions; it only persists/returns data
  - when recording failures/events, follow the same structures as the SQLite store

## Definition of Done (DoD)

- The Orchestrator can fully complete the happy path on the in-memory store.
- Tests can assert which events/failures were recorded.

## Test plan

- Unit:
  - load/save
  - recordEvent/recordFailure/markTaskDone

## Documentation links

- Spec v3: MVP state includes in-memory store: [`docs/ai-orchestrator-spec-v3.md` §24.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Persistence strategy: [`docs/ai-orchestrator-spec-v3.md` §10.1](../../docs/ai-orchestrator-spec-v3.md)

