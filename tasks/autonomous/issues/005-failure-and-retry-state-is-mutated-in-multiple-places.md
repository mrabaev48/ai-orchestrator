# Failure And Retry State Is Mutated In Multiple Places

## Issue ID
005

## Severity
High

## Category
State Management, Runtime Safety, Error Handling, API Contracts, Maintainability

## Summary
Failure recording and retry accounting are split between the orchestrator and state-store implementations. The same retry counter is incremented in more than one place, and PostgreSQL does not persist the full failure contract captured by the in-memory implementation.

## Evidence
- `packages/execution/src/orchestrator.ts` calls `stateStore.recordFailure` in `handleFailure`, then also increments `state.execution.retryCounts[task.id]`.
- `packages/state/src/in-memory/InMemoryStateStore.ts` increments `current.execution.retryCounts[input.taskId]` inside `recordFailure`.
- `packages/state/src/postgres/PostgresStateStore.ts` also increments `current.execution.retryCounts[input.taskId]` inside `recordFailure`.
- `InMemoryStateStore.recordFailure` preserves fields such as `status`, `checkpointRunId`, `checkpointStepId`, and `deadLetteredAt`.
- `PostgresStateStore.recordFailure` constructs a `FailureRecord` without preserving `status`, checkpoint fields, or `deadLetteredAt`, despite those fields being part of `RecordFailureInput`.

## Why This Is a Problem
Retry and DLQ behavior is a core execution-safety invariant. When responsibility is split across layers, retry state can drift from the actual failure record. Different store implementations also violate the same contract in different ways, so behavior depends on the selected backend.

## Risk
- Retry counts can be double-incremented, causing premature task blocking or incorrect split decisions.
- Dead-lettered failures can lose status and checkpoint metadata under PostgreSQL.
- Replay and resume operations can behave differently in memory versus PostgreSQL.
- Operators may be unable to reconstruct why a task was blocked or replayed.

## Recommended Direction
Make failure recording a single atomic domain/application operation with one owner for retry count mutation and a backend-independent persistence contract.

## Suggested Refactoring Steps
1. Decide whether retry count is owned by the failure handler or the state store, not both.
2. Update `RecordFailureInput` persistence so all implementations preserve the same fields.
3. Add contract tests that run against every `StateStore` implementation.
4. Treat failure recording, retry counter update, and DLQ status as one atomic transition.
5. Add regression tests for block, split, retry, resume, and replay paths.

## Acceptance Criteria for Resolution
- A failure increments retry count exactly once.
- Memory and PostgreSQL stores persist identical failure fields.
- DLQ checkpoint metadata survives persistence and reload.
- Contract tests cover all `StateStore` implementations.
- Retry decisions are deterministic across backends.
