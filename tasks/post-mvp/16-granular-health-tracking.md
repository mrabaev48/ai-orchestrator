# 16 — Granular health tracking

## Goal

Replace coarse repository health flags with more granular health tracking across build, test, lint, typecheck, runtime, and policy status.

## Scope

- richer health domain model
- source attribution and timestamps
- degraded/partial/unknown states with reasons
- query-friendly projections for API and reporting

## Dependencies

- `01-runtime-hardening-refactor.md`
- `14-richer-diagnostics.md`

## Definition of Done

- Health data is more expressive than simple passing/failing flags
- Consumers can trace why a subsystem is degraded
- Health status can influence stop conditions and reporting more precisely

## Test plan

- Unit tests for health model transitions
- Integration tests for diagnostics → health projection
- `npm run lint`, `npm run typecheck`, `npm test`
