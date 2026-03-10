# 04 — Planner role

## Goal

Implement the `Planner` role for milestone-aware backlog generation and dependency-aware task decomposition.

## Scope

- Planner role implementation
- Structured plan/backlog output schema
- Backlog update policy and conflict handling
- Integration with milestones, epics, features, and tasks

## Dependencies

- `01-runtime-hardening-refactor.md`
- `02-bootstrap-analyst-role.md`
- `03-architect-role.md`

## Definition of Done

- Planner produces structured backlog/milestone updates
- Dependencies and acceptance criteria are preserved in resulting tasks
- Output can be committed into `ProjectState` safely

## Test plan

- Unit tests for planner output validation
- Integration test for discovery → architect → planner chain
- `npm run lint`, `npm run typecheck`, `npm test`
