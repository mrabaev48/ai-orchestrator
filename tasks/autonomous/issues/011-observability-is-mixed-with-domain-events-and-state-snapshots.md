# Observability Is Mixed With Domain Events And State Snapshots

## Issue ID
011

## Severity
Medium

## Category
Observability, State Management, Runtime Safety, Maintainability, Scalability

## Summary
Operational telemetry, audit evidence, metrics, artifacts, and domain events are stored through the same state-store/event mechanisms. This blurs the boundary between durable business facts and high-volume operational signals.

## Evidence
- `packages/execution/src/telemetry.ts` records metrics through `StateStore` events.
- `packages/application/src/dashboard-query-service.ts` builds metrics audit and trace audit views from `stateStore.listEvents({ eventType: 'METRIC_RECORDED' })`.
- `packages/execution/src/orchestrator.ts` records tool evidence, model selection, token estimates, cost summaries, role execution, and task lifecycle into state/events/artifacts.
- `packages/state/src/PostgresStateStore.ts` persists full snapshots and event payloads in JSON fields rather than separate telemetry storage.
- Dashboard read models derive operational views from mixed event and artifact payload shapes.

## Why This Is a Problem
Domain events and telemetry have different lifecycle, volume, query, retention, and reliability requirements. Mixing them makes event streams harder to reason about and can cause telemetry volume to bloat state storage. It also makes observability schemas implicit because dashboard queries parse ad hoc payloads.

## Risk
- High-volume metrics can degrade state-store performance.
- Audit views can break when payload shapes evolve.
- Operators may confuse domain facts with sampled metrics or derived observations.
- Retention policies cannot be applied independently to telemetry and business state.

## Recommended Direction
Separate durable domain/audit events from telemetry. Keep correlation IDs consistent, but route metrics and spans to a telemetry port or dedicated table/store with explicit schemas.

## Suggested Refactoring Steps
1. Define separate ports for domain events, audit evidence, and telemetry.
2. Create typed metric/span schemas instead of ad hoc event payload parsing.
3. Store high-volume telemetry outside whole-state snapshots.
4. Keep correlation identifiers across all stores for reconstruction.
5. Update dashboard read models to query typed observability data.

## Acceptance Criteria for Resolution
- Domain events are not used as the primary metrics store.
- Metrics and spans have typed schemas and storage contracts.
- Dashboard observability queries do not parse arbitrary event payloads.
- Telemetry retention can be configured independently.
- Correlation across state, events, and telemetry remains explicit.
