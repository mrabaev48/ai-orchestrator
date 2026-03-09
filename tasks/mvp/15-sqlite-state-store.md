# 15 — SQLite StateStore

## Goal

Implement the MVP persistence backend on SQLite, supporting snapshots + events + operational tables (decisions/failures/artifacts).

## Context and business logic

SQLite is the MVP backend. Architecturally, the system uses:
- an **event log** for auditability
- **snapshots** for fast recovery
- **structured tables** for operational queries (minimal in MVP)

## Requirements

### Functional

- Implement `StateStore` on top of SQLite:
  - `load()` — load the latest snapshot
  - `save(state)` — write snapshots according to policy
  - `recordEvent(event)` — write to `domain_events`
  - `recordFailure(...)` — write to `failure_log` + reflect in state.failures
  - `markTaskDone(...)` — update task status + snapshots + events
- Snapshots are stored as serialized `ProjectState` JSON.
- Support DB schema migration/initialization (create tables on first run).

### Non-functional

- Atomicity (application-level): a batch of changes for a single commit does not leave the DB in an inconsistent state.
- Security: secrets must not end up in snapshots/events.

## Stack (reference)

- SQLite
- `better-sqlite3` (mentioned in the full spec Tech Stack as the MVP option)

## Implementation details

- `packages/state/sqlite/SqliteStateStore.ts`
- `packages/state/sqlite/schema.ts` (DDL)
- `packages/state/sqlite/migrate.ts` (migrations/initialization)
- Transaction boundaries:
  - write events + snapshot (and table updates) within a single transaction where possible

## Definition of Done (DoD)

- `control-plane bootstrap` creates the DB and an initial snapshot (on empty storage).
- `run-cycle` writes domain events and (per policy) snapshots.
- `export-backlog` works against state loaded from SQLite.

## Test plan

- Integration:
  - init → write snapshot → load() returns an identical state
  - record events/failures
  - runCycle happy path scenario with SQLite

## Documentation links

- Spec v3: Persistence strategy + MVP backend SQLite: [`docs/ai-orchestrator-spec-v3.md` §10.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: ER + required tables: [`docs/ai-orchestrator-spec-v3.md` §10.2–§10.3](../../docs/ai-orchestrator-spec-v3.md)
- Full spec (stack reference): [`docs/ts-linq-ai-orchestrator-full-spec.md` §18](../../docs/ts-linq-ai-orchestrator-full-spec.md)

