# State Store Uses Whole Snapshot Writes Without Concurrency Control

## Issue ID
004

## Severity
High

## Category
State Management, Runtime Safety, Scalability, Reliability, API Contracts

## Summary
State persistence is modeled as `load` followed by whole-state mutation and `save` or `saveWithEvents`, without optimistic concurrency, version checks, or compare-and-swap semantics. PostgreSQL persists snapshots but does not prevent lost updates from concurrent writers.

## Evidence
- `packages/state/src/StateStore.ts` exposes `load`, `save`, and `saveWithEvents` but no version, revision, expected checksum, or transactional mutation API.
- `packages/state/src/in-memory/InMemoryStateStore.ts` replaces the entire state on `save` and `saveWithEvents`.
- `packages/state/src/postgres/PostgresStateStore.ts` loads the latest snapshot, mutates it in caller code, then inserts a new snapshot in methods such as `recordFailure`, `recordArtifact`, `recordDecision`, and `markTaskDone`.
- `PostgresStateStore.insertSnapshot` appends a new snapshot row but does not check whether the snapshot being updated is still current.

## Why This Is a Problem
The orchestration runtime is stateful and has worker, lock, retry, approval, and replay concepts. Whole-snapshot writes without revision checks are fragile when multiple processes, dashboards, approval endpoints, or workers update state concurrently. A later save can silently overwrite a different actor's changes.

## Risk
- Approval decisions can be lost if a worker saves an older snapshot afterward.
- Retry counts, failure status, artifacts, or evidence entries can be overwritten.
- Operators may see inconsistent read models under concurrent writes.
- Scaling beyond a single process becomes unsafe even if distributed locks are configured.

## Recommended Direction
Introduce a versioned state mutation contract. State updates should happen through atomic commands or transactions with an expected revision, not arbitrary whole-object replacement.

## Suggested Refactoring Steps
1. Add a state revision or monotonic version to `ProjectState` snapshots.
2. Replace generic `save` usage with explicit mutation methods for critical transitions.
3. Add optimistic concurrency checks in PostgreSQL.
4. Return structured conflict errors so callers can retry safely.
5. Keep append-only logs for events/evidence and rebuild read models from durable facts where possible.

## Acceptance Criteria for Resolution
- Concurrent writes cannot silently overwrite each other.
- Critical state transitions use atomic repository methods.
- PostgreSQL writes fail on stale expected revisions.
- Tests cover concurrent approval/update and worker/update conflicts.
- The `StateStore` contract documents its concurrency guarantees.
