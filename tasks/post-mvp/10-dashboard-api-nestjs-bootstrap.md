# 10 — Dashboard API bootstrap on NestJS

## Goal

Create the post-MVP `dashboard-api` application on NestJS as the production-grade backend entry point for operational visibility.

## Scope

- Scaffold `apps/dashboard-api` on NestJS
- Add configuration, health endpoint, and module structure
- Wire read-only access to state/query services
- Establish production conventions: DTOs, validation, exception filters, logging

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- `apps/dashboard-api` exists as a NestJS app
- The app starts with production-grade module boundaries and config
- A basic health/readiness endpoint is available
- The API is read-only and cleanly separated from write-side orchestration services

## Test plan

- Unit tests for modules/controllers/services
- E2E test for health endpoint
- `npm run lint`, `npm run typecheck`, `npm test`
