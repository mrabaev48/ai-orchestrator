# 11 — Dashboard query endpoints

## Goal

Implement the read-only dashboard query endpoints for state, backlog, milestones, events, failures, decisions, artifacts, and latest run summaries.

## Scope

- NestJS controllers for read endpoints
- Query services / DTOs / serialization rules
- Pagination/filtering where needed for history endpoints
- Omit unknown or unsafe raw provider fields

## Dependencies

- `01-runtime-hardening-refactor.md`
- `10-dashboard-api-nestjs-bootstrap.md`

## Definition of Done

- Endpoints equivalent to documented read-only dashboard scope are available
- Responses are explicitly shaped DTOs, not raw persistence blobs
- Payloads are safe and stable for UI consumption

## Test plan

- Controller/service unit tests
- E2E tests for documented endpoints
- `npm run lint`, `npm run typecheck`, `npm test`
