# 17 — Richer export pipeline

## Goal

Implement richer export capabilities for backlog, run summaries, diagnostics, and integration payloads.

## Scope

- richer export DTOs/formats
- export services separated from orchestration runtime
- artifact tracking for generated exports
- support for API and CLI initiated exports

## Dependencies

- `09-integration-manager-role.md`
- `11-dashboard-query-endpoints.md`
- `12-postgresql-state-backend.md` (optional but recommended for production scale)

## Definition of Done

- Export flow supports more than MVP backlog markdown/JSON
- Export artifacts are traceable and queryable
- Export logic is reusable across CLI and API entry points

## Test plan

- Unit tests for export mappers
- Integration tests for export generation and artifact persistence
- `npm run lint`, `npm run typecheck`, `npm test`
