# Runtime architecture

## Current module boundaries

The runtime is organized as a layered backend with explicit composition at the edge:

- `apps/control-plane`
  - CLI-only entrypoint
  - parses command-line input
  - delegates application use cases
- `packages/application`
  - composition root for the current runtime
  - application services for control-plane operations
  - bootstrap/discovery service for initial repository understanding
  - architecture analysis service for decision-ready findings
  - planning service for milestone-aware backlog updates
  - documentation service for bounded generated summaries
  - release readiness service for structured stability assessment
  - state integrity service for explainable validation and repair guidance
  - integration export service for external payload preparation without side effects
  - read models for CLI and future API consumers
- `packages/execution`
  - orchestrator runtime and run-cycle coordination
- `packages/workflow`
  - stage transitions, task routing, retry policies
- `packages/agents`
  - role contracts, registry, and concrete role implementations
- `packages/prompts`
  - prompt pipeline and optimized prompt construction
- `packages/state`
  - persistence ports and adapters
  - in-memory and PostgreSQL implementations
- `packages/core`
  - domain state, entities, invariants, and domain events
- `packages/shared`
  - runtime config, logging, shared errors
- `packages/tools`
  - tool adapter contracts and local tool integrations

## Composition rules

- The CLI must not wire orchestrator dependencies directly.
- Runtime assembly happens in `packages/application/src/runtime-factory.ts`.
- Control-plane operations go through `ControlPlaneService`.
- Read-side output must go through `packages/application/src/read-models.ts` instead of exposing raw state shaping logic from the CLI.

## Why this matters

This split keeps composition, orchestration, persistence, and presentation concerns separate enough for the next post-MVP steps:

- new roles can be added without expanding CLI wiring
- NestJS API work can reuse application services and read models
- persistence backends can grow independently from command handling
- runtime behavior remains testable without shell-level integration for every change

## Run lock operations

- `NoopLockAuthority` is a **single-node fallback only**. It does not coordinate lock ownership between workers.
- Multi-worker execution requires a shared lock backend configured with:
  - `WORKFLOW_RUN_LOCK_PROVIDER` (`postgresql`, `redis`, or `etcd`)
  - one shared `WORKFLOW_RUN_LOCK_DSN` used by **all workers**
- If the global run lock cannot be acquired, the orchestrator returns an idle cycle with `stopReason=run_lock_unavailable` and emits a deterministic runtime log event (`cycle_idle_lock_unavailable`) for operators.
- The runtime also emits a contention counter metric (`run_lock_contention_total`) as centralized `METRIC_RECORDED` domain events in the shared state store, enabling cross-worker aggregation in multi-worker deployments.
