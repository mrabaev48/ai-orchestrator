# 12 — PostgreSQL state backend

## Goal

Implement a production-grade PostgreSQL state backend alongside SQLite, preserving the `StateStore` contract and atomicity guarantees.

## Scope

- PostgreSQL adapter and schema
- migrations / initialization path
- snapshot, events, failures, decisions, artifacts persistence
- transaction handling and read/write serialization behavior

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- PostgreSQL-backed `StateStore` can replace SQLite without orchestration code changes
- Transactional integrity is preserved for run-cycle writes
- Persistence schema and migrations are versioned and testable

## Test plan

- Integration tests against PostgreSQL
- Contract tests shared between SQLite and PostgreSQL stores
- `npm run lint`, `npm run typecheck`, `npm test`
