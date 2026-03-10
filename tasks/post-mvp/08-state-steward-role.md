# 08 — State Steward role

## Goal

Implement the `State Steward` role for advanced state integrity validation and repair guidance.

## Scope

- Role implementation for integrity analysis
- Repair recommendations / repair artifact schema
- Integration with state corruption and escalation flows
- Optional safe repair path for non-destructive fixes

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- State Steward can inspect invalid/inconsistent state and return structured findings
- Repair recommendations are persisted and explainable
- Unsafe repairs still require escalation

## Test plan

- Unit tests for integrity finding mapping
- Integration test for invalid state → steward report
- `npm run lint`, `npm run typecheck`, `npm test`
