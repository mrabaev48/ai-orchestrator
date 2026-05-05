# Dashboard API Contracts And Read Models Are Inconsistent

## Issue ID
009

## Severity
High

## Category
API Contracts, Module Boundaries, Runtime Safety, Testing, Maintainability

## Summary
The dashboard API and application read model contain broken and inconsistent contracts. Some controller methods are not routed, some code paths are unreachable or malformed, and the dashboard module initializes a store scoped to a different project than the main orchestrator default.

## Evidence
- `apps/dashboard-api/src/dashboard-query/dashboard-query.controller.ts` defines `getLatestProductionReadinessReview` without a route decorator.
- The same method contains an unreachable `return await this.dashboardReadApiService.getApprovals(query.status);`.
- `apps/dashboard-api/src/dashboard-query/dashboard-query.service.ts` has stray object-spread lines after `getLatestProductionReadinessReview`, indicating API method implementation drift.
- `packages/application/src/dashboard-query-service.ts` has malformed logic around `getLatestProductionReadinessReview`, including use of `state` before declaration and dangling `.filter(...)` code.
- `apps/dashboard-api/src/read-model/read-model.module.ts` creates an initial state with `projectId: 'dashboard-api'`, while CLI and worker defaults use `projectId: 'ai-orchestrator'`.

## Why This Is a Problem
Read APIs are the operational surface for state, approvals, evidence, and readiness. Broken or inconsistent contracts make the dashboard unreliable as an operator tool. Project-scope drift between apps can also make the dashboard query a different tenant/project partition than the orchestrator writes.

## Risk
- Production readiness data may be inaccessible or fail at runtime.
- Approval history endpoints can be missing or unreachable.
- Operators may inspect an empty or wrong project state.
- Type and e2e tests can miss API drift if controller routes and service contracts are not validated end-to-end.

## Recommended Direction
Treat dashboard endpoints as public API contracts with explicit route definitions, DTOs, service interfaces, and e2e coverage. Ensure dashboard state scope is configured from the same runtime project identity used by writers.

## Suggested Refactoring Steps
1. Define a route map or OpenAPI-style contract for dashboard endpoints.
2. Repair read-model methods behind the application service contract.
3. Configure dashboard project scope from runtime config rather than hardcoded `dashboard-api`.
4. Add e2e tests for every dashboard route and approval/readiness endpoint.
5. Add compile-time checks that controller DTOs match service inputs.

## Acceptance Criteria for Resolution
- Every intended dashboard endpoint has a route decorator and e2e coverage.
- No unreachable or malformed service code remains in dashboard read paths.
- Dashboard and orchestrator use the same configured tenant/project scope.
- Read-model methods are fully typed and contract-tested.
- API changes require updating route-level tests.
