# 05 — Task splitting automation

## Goal

Automate task splitting after repeated failures so the orchestrator can reduce scope instead of only retrying or blocking.

## Scope

- Extend retry policy with split action
- Generate child tasks preserving traceability to the parent
- Record split rationale in failures/artifacts/decisions where needed
- Update task selection to prefer valid split children

## Dependencies

- `01-runtime-hardening-refactor.md`
- `04-planner-role.md`

## Definition of Done

- After repeated failures, the system can create smaller executable follow-up tasks
- Parent/child traceability is preserved in state and exports
- Split tasks participate correctly in routing and dependency rules

## Test plan

- Unit tests for split policy decisions
- Integration test for failure → split → next task selection
- `npm run lint`, `npm run typecheck`, `npm test`
