# 06 — Milestone model (`Milestone`)

## Goal

Implement the milestone model and its progress rules for the MVP so orchestration has explicit stopping boundaries and “done” criteria.

## Context and business logic

A milestone is the primary unit of “bounded autonomy”. In the MVP, only one milestone is allowed to be `in_progress`. Milestone completion is only possible when exit criteria are satisfied.

## Requirements

### Functional

- `Milestone` type:
  - `id`, `title`, `goal`
  - `status`: todo/in_progress/done/blocked
  - `epicIds: string[]`
  - `entryCriteria: string[]`
  - `exitCriteria: string[]`
- Rules:
  - only one milestone can be `in_progress` at a time
  - `currentMilestoneId` in `ProjectState` must reference an existing milestone
  - a `blocked` milestone requires an escalation record (at minimum: artifact/failure with reason)

### Non-functional

- Detailed criteria are stored as strings suitable for export/reporting.

## Stack

- TypeScript

## Implementation details

- `packages/core/milestones/*`
  - `Milestone` type
  - utilities:
    - `getActiveMilestone(state)`
    - `canEnterMilestone(state, milestone)` (by entryCriteria)
    - `isMilestoneComplete(state, milestone)` (by exitCriteria + required tasks)
- In `packages/workflow`, use `isMilestoneComplete()` at the `complete_milestone` stage.

## Definition of Done (DoD)

- The “single milestone in_progress” invariant is enforced (and tested).
- A milestone can transition to `done` only when exit criteria are satisfied.

## Test plan

- Unit:
  - single in_progress
  - isMilestoneComplete on simple scenarios

## Documentation links

- Spec v3: Milestone model + rules: [`docs/ai-orchestrator-spec-v3.md` §9.3](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Milestone completion phase: [`docs/ai-orchestrator-spec-v3.md` §15.13](../../docs/ai-orchestrator-spec-v3.md)

