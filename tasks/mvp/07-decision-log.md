# 07 — Decision log

## Goal

Introduce an immutable decision log so that any meaningful direction changes (architecture, workflow policy, stop/retry rules) have a clear “why”, are auditable, and are reproducible.

## Context and business logic

The system must be explainable: “why we did it” matters more than “what we did”. Decisions are recorded separately from events/logs and are not edited retroactively.

## Requirements

### Functional

- `DecisionLogItem` type:
  - `id`, `title`, `decision`, `rationale`, `affectedAreas`, `createdAt`
- Rules:
  - records are immutable: corrections must be new entries
  - record decisions when the architectural/policy direction changes
- Persistence:
  - store in state (`ProjectState.decisions`) and in PostgreSQL (`decision_log`)

### Non-functional

- Entries are suitable for export and human review.

## Stack

- TypeScript
- PostgreSQL (table `decision_log`)

## Implementation details

- `packages/core/decisions/*` — types + helpers
- `packages/state`:
  - decision write methods (MVP: `recordEvent` + snapshot may be sufficient, but `decision_log` is required by schema)
  - serialize/deserialize the decision array in snapshots

## Definition of Done (DoD)

- A decision can be added to state and it is persisted in snapshots.
- You cannot “update” an existing decision without creating a new entry (at the API/port level).

## Test plan

- Unit: decision format and validation
- Integration: snapshot roundtrip preserves decisions

## Documentation links

- Spec v3: Decision log contract + rules: [`docs/ai-orchestrator-spec-v3.md` §9.4](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Persistence required tables: [`docs/ai-orchestrator-spec-v3.md` §10.3](../../docs/ai-orchestrator-spec-v3.md)

