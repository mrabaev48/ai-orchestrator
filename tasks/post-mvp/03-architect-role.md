# 03 — Architect role

## Goal

Implement the `Architect` role for structured architecture analysis, risk identification, and decision-ready findings.

## Scope

- Architect role implementation
- Output schema for architecture findings
- Integration with decisions/artifacts
- Reuse Bootstrap Analyst output as input context

## Dependencies

- `01-runtime-hardening-refactor.md`
- `02-bootstrap-analyst-role.md`

## Definition of Done

- Architect can produce structured architecture findings
- Findings can be persisted and referenced in decisions/backlog planning
- Architecture output avoids free-form-only prose and supports downstream automation

## Test plan

- Unit tests for schema validation and mapping
- Integration test for bootstrap → architect flow
- `npm run lint`, `npm run typecheck`, `npm test`
