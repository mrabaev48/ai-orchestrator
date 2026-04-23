# 04 — `ProjectState` domain model

## Goal

Implement the `ProjectState` domain model as the central persisted state, including reference invariants and the minimal structure required for the MVP cycle (task selection → prompt → role → review → test → commit).

## Context and business logic

State is a first-class concern: the system must not “live” only inside prompt history. Any progress must be recoverable, traceable, and integrity-checked.

## Requirements

### Functional

- `ProjectState` includes (minimum):
  - project identity (`projectId`, `projectName`, `summary`)
  - `currentMilestoneId`
  - `architecture` (minimum: packageMap/subsystemMap/unstableAreas/criticalPaths)
  - `repoHealth` (build/tests/lint/typecheck)
  - `backlog` (epics/features/tasks)
  - `execution` (activeTaskId/activeRunId/completedTaskIds/blockedTaskIds/retryCounts/stepCount)
  - `milestones`, `decisions`, `failures`, `artifacts`
- Add state invariant validation:
  - `activeTaskId`, `currentMilestoneId` reference existing entities
  - blocked tasks cannot be selected
  - completed tasks do not return to `todo` without an explicit reset/replay policy

### Non-functional

- Strict typing without `any`.
- State is serializable (PostgreSQL snapshot JSON).

## Stack

- TypeScript
- (Optional) Zod for runtime validation of snapshot JSON on load

## Implementation details

- `packages/core/state/ProjectState.ts`
  - types/interfaces
  - `validateProjectState(state): ValidationResult`
  - `assertProjectState(state): void` (throws a domain error)
- `packages/state` uses validation on `load()` and before `save()`.

## Definition of Done (DoD)

- State covers the fields required for MVP success criteria (task selection, prompt generation, execution, review/test, commit).
- Invalid state (broken references/transitions) causes stop/escalation (at minimum a hard stop) and logs the reason.

## Test plan

- Unit:
  - invariant validation (valid/invalid state)
- Integration:
  - snapshot load/save via PostgreSQL store (JSON roundtrip)

## Documentation links

- Spec v3: `ProjectState` contract + rules: [`docs/ai-orchestrator-spec-v3.md` §9.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: “State is first-class”: [`docs/ai-orchestrator-spec-v3.md` §4.2](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Stop conditions include state integrity uncertain: [`docs/ai-orchestrator-spec-v3.md` §13.5](../../docs/ai-orchestrator-spec-v3.md)

