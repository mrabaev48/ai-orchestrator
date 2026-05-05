# Orchestrator Has Too Many Runtime Responsibilities

## Issue ID
003

## Severity
High

## Category
Architecture, Module Boundaries, State Management, Runtime Safety, Error Handling, Observability, Maintainability, Scalability

## Summary
`Orchestrator` is a large central class that combines workflow selection, policy gates, role execution, tool invocation, workspace management, git lifecycle, state mutation, telemetry, cost tracking, retries, approvals, and failure handling.

## Evidence
- `packages/execution/src/orchestrator.ts` is a very large class with imports from `core`, `shared`, `state`, `tools`, `workflow`, and `agents`.
- The constructor creates tool sets, lock authorities, fencing guards, telemetry, and workspace managers.
- `runCycle` and `runTaskInWorkspace` mutate project state, allocate workspaces, invoke roles, enforce policies, record artifacts, and persist events.
- The same class contains methods for model selection, cost tracking, quality-stage artifacts, git lifecycle artifacts, policy decision persistence, and role validation.

## Why This Is a Problem
The orchestrator is the core runtime control point, but its responsibilities are not decomposed into stable collaborators. This makes execution behavior difficult to reason about, test, or evolve safely. Small changes in one concern can affect unrelated concerns such as telemetry, state persistence, workspace cleanup, or approval handling.

## Risk
- Retry, timeout, cancellation, and persistence changes can create regressions in unrelated paths.
- Failure handling becomes hard to make deterministic because side effects are interleaved.
- New execution stages require editing a high-blast-radius class.
- Operational incidents become harder to debug because decisions are spread through one procedural flow.

## Recommended Direction
Split execution into focused services with explicit contracts: task selection, run lifecycle, role runner, policy gate coordinator, workspace lifecycle, side-effect recorder, failure handler, and telemetry reporter.

## Suggested Refactoring Steps
1. Extract role execution and validation into a `RoleRunner`.
2. Extract state transition and event persistence into a transaction-oriented service.
3. Extract workspace/git lifecycle into a separate coordinator.
4. Extract failure handling and retry/DLQ decisions into a dedicated component.
5. Keep `Orchestrator` as a thin use-case coordinator that composes these ports.

## Acceptance Criteria for Resolution
- `Orchestrator` delegates each major responsibility to typed collaborators.
- State transitions and side effects are explicit and separately testable.
- Role execution can be tested without workspace/git/state-store setup.
- Failure handling can be tested without running a full cycle.
- The orchestrator no longer directly imports every runtime package.
