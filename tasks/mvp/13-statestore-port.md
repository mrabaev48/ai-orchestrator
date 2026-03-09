# 13 — `StateStore` port (интерфейс)

## Goal

Define the `StateStore` port that isolates orchestration from the concrete persistence backend and supports MVP operations: load/save state, recording events, recording failures, and completing a task.

## Context and business logic

State persistence is separate from orchestration policy. `StateStore` provides:
- loading the latest snapshot
- recording events (audit log)
- recording failures and artifacts
- atomically persisting accepted progress (commit state)

## Requirements

### Functional

- Interface (minimum):
  - `load(): Promise<ProjectState>`
  - `save(state: ProjectState): Promise<void>`
  - `recordEvent(event: DomainEvent): Promise<void>`
  - `recordFailure(taskId: string, role: AgentRoleName, reason: string): Promise<void>`
  - `markTaskDone(taskId: string, summary: string): Promise<void>`
- Behavior:
  - `load()` returns a valid `ProjectState` or an integrity error
  - write methods must not leak secrets in payloads

### Non-functional

- Strict typing.
- Ability to use an in-memory store in tests.

## Stack

- TypeScript

## Implementation details

- `packages/state/StateStore.ts` — port interface
- Implementations:
  - `InMemoryStateStore`
  - `SqliteStateStore`

## Definition of Done (DoD)

- The Orchestrator uses only `StateStore` (no direct SQLite access).
- The store can be swapped for in-memory in tests.

## Test plan

- Unit: contract and basic mocks
- Integration: happy path run with in-memory store

## Documentation links

- Spec v3: Example `StateStore`: [`docs/ai-orchestrator-spec-v3.md` §27.2](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Persistence strategy (events + snapshots): [`docs/ai-orchestrator-spec-v3.md` §10.1](../../docs/ai-orchestrator-spec-v3.md)

