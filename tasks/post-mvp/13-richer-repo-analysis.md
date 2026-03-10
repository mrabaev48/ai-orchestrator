# 13 — Richer repository analysis

## Goal

Extend repository analysis beyond MVP basics to provide stronger architectural, dependency, and hotspot context for orchestrated roles.

## Scope

- richer codebase inventory
- dependency and module topology extraction
- unstable/hotspot detection signals
- reusable query/read model for roles and dashboard

## Dependencies

- `01-runtime-hardening-refactor.md`
- `02-bootstrap-analyst-role.md`

## Definition of Done

- Repository analysis produces structured signals beyond simple file inventory
- Findings can be reused by Architect, Planner, and dashboard endpoints
- The analysis path is deterministic and testable

## Test plan

- Unit tests for analyzers
- Integration test on repository fixture
- `npm run lint`, `npm run typecheck`, `npm test`
