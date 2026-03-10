# 09 — Integration Manager role

## Goal

Implement the `Integration Manager` role for export preparation and mapping internal state into external integration payloads.

## Scope

- Role implementation
- Export payload schema(s)
- Mapping from tasks/features/epics/artifacts to integration records
- Guardrails for external write preparation vs. actual mutation

## Dependencies

- `01-runtime-hardening-refactor.md`
- `04-planner-role.md`

## Definition of Done

- Integration Manager produces structured export-ready payloads
- Payloads preserve traceability to internal entities
- External write concerns remain decoupled from orchestration core

## Test plan

- Unit tests for payload mapping
- Integration test for export preparation flow
- `npm run lint`, `npm run typecheck`, `npm test`
