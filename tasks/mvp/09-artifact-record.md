# 09 — Artifact record

## Goal

Introduce the `ArtifactRecord` model and a minimal set of artifacts the system must create and/or reference (summary, report, export, plan, test_plan, etc.).

## Context and business logic

Artifacts provide traceability and recoverability: planning outputs, run summaries, and backlog exports must be available independently of the LLM context.

## Requirements

### Functional

- `ArtifactRecord` type:
  - `id`, `type`, `title`, `location?`, `metadata`, `createdAt`
- Minimum artifacts for MVP:
  - optimized prompt (at least a reference/metadata)
  - run summary (per cycle)
  - backlog export
- Persistence:
  - `ProjectState.artifacts`
  - SQLite `artifact_log`

### Non-functional

- `metadata` must be serializable (strings) and must not contain secrets.
- `location` can be a path in the repository or an external storage reference (MVP: a workspace path).

## Stack

- TypeScript
- SQLite (table `artifact_log`)

## Implementation details

- `packages/core/artifacts/*` — types and allowed `type` values
- `packages/state`:
  - `recordArtifact(artifact)`
  - write to `artifact_log` + include in snapshots
- `apps/control-plane`:
  - `export-backlog` must create an artifact referencing the export file

## Definition of Done (DoD)

- The system can persist an artifact record in state and restore it when loading a snapshot.
- `export-backlog` creates an artifact and records it in state.

## Test plan

- Unit: `ArtifactRecord` type validation
- Integration: export-backlog → artifact_log + snapshot

## Documentation links

- Spec v3: Artifact record contract: [`docs/ai-orchestrator-spec-v3.md` §9.6](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Required tables include artifact_log: [`docs/ai-orchestrator-spec-v3.md` §10.3](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: CLI export-backlog: [`docs/ai-orchestrator-spec-v3.md` §20.1](../../docs/ai-orchestrator-spec-v3.md)

