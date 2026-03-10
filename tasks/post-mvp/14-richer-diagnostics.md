# 14 — Richer diagnostics pipeline

## Goal

Implement richer diagnostics collection and aggregation for build, test, lint, typecheck, and orchestration anomalies.

## Scope

- diagnostics service abstraction
- normalized diagnostics model
- aggregation of tool/runtime failures into queryable/readable artifacts
- improved error and health summaries

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- Diagnostics are normalized into structured records
- Runtime and tool failures can be surfaced consistently to roles and API consumers
- Diagnostics no longer rely only on raw strings/log text

## Test plan

- Unit tests for diagnostics normalization
- Integration tests for tool output parsing
- `npm run lint`, `npm run typecheck`, `npm test`
