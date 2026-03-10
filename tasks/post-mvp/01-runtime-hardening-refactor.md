# 01 — Runtime hardening and production refactor

## Goal

Refactor the current MVP codebase into a production-grade runtime foundation with stricter module boundaries, cleaner application services, and explicit orchestration abstractions suitable for post-MVP expansion.

## Why this task exists

The roadmap assumes multiple new roles, richer persistence backends, and an API layer. Those features will amplify coupling unless the runtime is first hardened around SOLID boundaries, stable ports, and explicit services.

## Scope

- Split orchestration concerns into clearer application services
- Remove ad hoc wiring from CLI and centralize composition
- Tighten state transition validation and runtime contracts
- Formalize read models / DTO boundaries for future API consumption
- Make current runtime easier to extend without editing many unrelated modules

## Deliverables

- Refactored execution composition root
- Clear service/module boundaries for workflow, prompts, roles, and persistence
- Read-model layer for state snapshots and run summaries
- Updated architecture docs where structure changed materially

## Dependencies

- Current MVP runtime block on `main`

## Definition of Done

- The runtime composes through stable ports/adapters instead of direct cross-module coupling
- The CLI no longer owns orchestration details beyond command handling
- Read-side models are separated from persisted/raw state shape
- Existing MVP behavior remains green after refactor

## Test plan

- Unit tests for refactored application services
- Integration tests for CLI → orchestration composition
- Full regression run: `npm run lint`, `npm run typecheck`, `npm test`
