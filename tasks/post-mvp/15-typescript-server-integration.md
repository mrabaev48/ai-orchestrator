# 15 — Better TypeScript server integration

## Goal

Improve TypeScript tooling integration beyond shelling out to `tsc`, enabling more granular diagnostics and richer language-service aware workflows.

## Scope

- a stronger TypeScript tool adapter
- incremental/project-aware diagnostics
- file/module scoped checks where possible
- output model suitable for roles and dashboard

## Dependencies

- `01-runtime-hardening-refactor.md`
- `14-richer-diagnostics.md`

## Definition of Done

- TypeScript diagnostics can be requested in a more granular and reusable way
- Results are structured and compatible with runtime policies and API read models
- The integration remains behind a stable tool port

## Test plan

- Unit tests for TS diagnostics mapping
- Integration test for diagnostics on fixture projects
- `npm run lint`, `npm run typecheck`, `npm test`
