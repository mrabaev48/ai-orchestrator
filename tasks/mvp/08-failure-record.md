# 08 — Failure record

## Goal

Implement the `FailureRecord` model and its usage rules so that every meaningful failure/deviation influences system behavior (retry/split/escalation) rather than triggering “blind” repetition.

## Context and business logic

Failures are a source of adaptation: a rerun must differ from the previous attempt (stronger constraints, smaller scope, different context selection). Failure history is input for Prompt Engineer and Workflow Engine.

## Requirements

### Functional

- `FailureRecord` type:
  - `id`, `taskId`, `role`, `reason`, `symptoms`, `badPatterns`, `retrySuggested`, `createdAt`
- Rules:
  - every execution failure that affects progression must be recorded
  - repeated failures influence task selection and escalation
- Persistence:
  - stored in `ProjectState.failures`
  - written to SQLite `failure_log` and reflected in snapshots/events

### Non-functional

- Failure reasons must be suitable for “constraint injection” (short, no secrets).

## Stack

- TypeScript
- SQLite (table `failure_log`)

## Implementation details

- `packages/core/failures/*`:
  - types + helpers (`toRetryConstraints(failures)` / `classifyBadPatterns(...)`)
- `packages/state`:
  - `recordFailure(taskId, role, reason, payload?)`
  - automatic update of `execution.retryCounts[taskId]` (or equivalent) on commit
- `packages/prompts`:
  - use failures as input to modify prompts on retry

## Definition of Done (DoD)

- When a review is rejected or tests fail, a failure is recorded (taskId+role+reason).
- On the 2nd and 3rd failure, split/block+escalate policy is triggered (per workflow policy).

## Test plan

- Unit: correct construction of retry constraints from failure history
- Integration: scenarios from the specification “Reviewer rejection path” and “Tester failure path”

## Documentation links

- Spec v3: Failure record contract + rules: [`docs/ai-orchestrator-spec-v3.md` §9.5](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Retry policy (1/2/3): [`docs/ai-orchestrator-spec-v3.md` §13.4, §17.5](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Scenarios — reviewer/tester failure paths: [`docs/ai-orchestrator-spec-v3.md` §18.2–§18.3](../../docs/ai-orchestrator-spec-v3.md)

