# 02 — Bootstrap Analyst role

## Goal

Implement the `Bootstrap Analyst` role and wire it into the bootstrap/discovery path so the system can produce reusable initial repository/system understanding.

## Scope

- Add role contract implementation
- Add prompt template/schema for bootstrap analysis
- Persist bootstrap findings into state/artifacts
- Ensure the output is reusable by Architect and Planner

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- Bootstrap flow can invoke `Bootstrap Analyst`
- Structured findings are stored as artifacts and/or state projections
- Bootstrap output is usable as downstream context for architecture/planning stages

## Test plan

- Unit tests for output mapping/validation
- Integration test for bootstrap flow with mock LLM
- `npm run lint`, `npm run typecheck`, `npm test`
