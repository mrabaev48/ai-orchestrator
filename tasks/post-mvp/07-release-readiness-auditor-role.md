# 07 — Release Readiness Auditor role

## Goal

Implement the `Release Readiness Auditor` role for structured stability and release risk assessment.

## Scope

- Role implementation and schema
- Integration with repo health, failures, test evidence, and decisions
- Risk scoring / summary artifact generation

## Dependencies

- `01-runtime-hardening-refactor.md`

## Definition of Done

- The orchestrator can request a structured release assessment
- The role surfaces blockers, warnings, and evidence explicitly
- Results are exportable and linkable to runs/milestones

## Test plan

- Unit tests for risk classification
- Integration test for readiness assessment artifact generation
- `npm run lint`, `npm run typecheck`, `npm test`
