# 05 — Backlog models (`Epic`, `Feature`, `BacklogTask`)

## Goal

Implement domain backlog entities that are the source of truth for selecting the next work item (Task Manager) and routing roles (workflow router).

## Context and business logic

The backlog must be **executable**: every task has acceptance criteria, a kind, dependencies, and a list of affected modules. This enables bounded autonomy and reduces scope drift.

## Requirements

### Functional

- `Epic`: id/title/goal/status/featureIds
- `Feature`: id/epicId/title/outcome/risks/taskIds
- `BacklogTask`:
  - `kind` (MVP set per specification)
  - `status` (todo/in_progress/review/testing/done/blocked)
  - `priority` (p0–p3)
  - `dependsOn: string[]`
  - `acceptanceCriteria: string[]` (required)
  - `affectedModules: string[]` (required when applicable)
  - `estimatedRisk` (low/medium/high)
- Rules:
  - no tasks without acceptance criteria
  - blocked tasks require an explicit reason (via failure/artifact)

### Non-functional

- Strict typing.
- Stable identifiers (prefer string ids with prefixes).

## Stack

- TypeScript

## Implementation details

- `packages/core/backlog/*`
  - model types
  - utilities:
    - `isExecutableTask(state, task)` (deps satisfied, not blocked, status todo)
    - `priorityWeight(priority)` per policy
- These models are used by:
  - `packages/workflow` (router, policy)
  - `packages/agents` (TaskManagerAgent)
  - `packages/state` (persist/serialize)

## Definition of Done (DoD)

- All listed fields exist and are used in selection/routing logic.
- Invalid tasks (missing acceptanceCriteria/kind) cannot be executed automatically (must be blocked/escalated).

## Test plan

- Unit:
  - backlog task required field validation
  - executable filter checks (blocked/deps/status)

## Documentation links

- Spec v3: Backlog model + task rules: [`docs/ai-orchestrator-spec-v3.md` §9.2](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Priority policy: [`docs/ai-orchestrator-spec-v3.md` §17.2](../../docs/ai-orchestrator-spec-v3.md)

