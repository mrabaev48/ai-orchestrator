# 02 — Structured logger

## Goal

Introduce a single structured logger that covers key orchestration events (cycle/task/prompt/role/review/test/state) and supports correlation by `runId`/`taskId`/`role`.

## Context and business logic

Observability is part of the MVP: the system must be debuggable and auditable. Logs are the primary basis for investigating recurring failures and enforcing guardrails.

## Requirements

### Functional

- A single logging interface for all packages and apps.
- Structured fields (minimum):
  - `event` (строка/enum)
  - `runId`, `taskId`, `milestoneId` (if applicable)
  - `role`
  - `stage` (`WorkflowStage`)
  - `durationMs` (for measurable operations)
  - `result` (`ok` | `fail`) and `reason` (for failure paths)
- Levels: debug/info/warn/error.
- Secret redaction (LLM keys, DSN, etc.).

### Non-functional

- Logs must not leak PII/secrets.
- Format must be suitable for shipping to a log collector (JSON).

## Stack (reference)

- Pino (recommended; see full spec Tech Stack)

## Implementation details

- `packages/shared`:
  - `Logger` interface
  - `createLogger(config)` factory
  - `withContext({runId, taskId, ...})` to enrich logs
- Usage:
  - `apps/control-plane` — CLI commands
  - `packages/execution` — execution cycle and run summary
  - `packages/state` — snapshot/event/failure writes

## Definition of Done (DoD)

- Required MVP log events are present (cycle_start/end, task_selected, ...).
- Each log entry includes enough context for tracing (at minimum: runId + stage).
- Secrets are redacted (verified by tests).

## Test plan

- Unit:
  - redaction
  - correct generation of contextual fields
- Integration:
  - `run-cycle` produces the expected sequence of key log events

## Documentation links

- Spec v3: Logs — required events: [`docs/ai-orchestrator-spec-v3.md` §22.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Observability layer in the architecture: [`docs/ai-orchestrator-spec-v3.md` §5.1](../../docs/ai-orchestrator-spec-v3.md)
- Full spec (stack reference): [`docs/ts-linq-ai-orchestrator-full-spec.md` §18](../../docs/ts-linq-ai-orchestrator-full-spec.md)

