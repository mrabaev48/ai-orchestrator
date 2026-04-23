# 01 — Typed runtime config

## Goal

Create a single, strictly typed runtime configuration layer that is validated **before** orchestration starts and unambiguously defines: the LLM provider, the state backend, execution limits, and tool write paths/scopes.

## Context and business logic

Initialization (Phase 0) must hard-fail on invalid configuration to prevent partial runs and “half-states”. Configuration is an input to stop conditions, retry caps, and write scoping (safety).

## Requirements

### Functional

- **Configuration source**: `.env` / environment variables + (optionally) a configuration file.
- **Validation**: all required fields are validated at startup.
- **Defaults**: optional fields have safe default values.
- **Normalization**: values are normalized to canonical types (numbers, booleans, enums).
- **Availability across layers**: config is accessible from `apps/control-plane` and `execution/state/llm/tools/workflow` packages.

### Non-functional

- **Security**: secrets (API keys) are not logged and are not persisted into state.
- **Determinism**: same env inputs → same resulting config.
- **Strict typing**: no `any`; all fields have explicit types/enums.

## Stack (reference)

- TypeScript (Node.js runtime)
- Schema validation: Zod (recommended; see “Tech Stack” in the full spec)

## Implementation details

### Where the code lives

- `packages/shared`:
  - `RuntimeConfig` (type/interface)
  - `loadRuntimeConfig()` (load + validate)
  - `redactSecrets()` (safe logging utility)

### What must be in the config (MVP minimum)

- **LLM**: provider kind, model, temperature defaults, timeout
- **State**: backend (`memory` | `postgresql`), path to the postgresql db, snapshot policy flags
- **Workflow limits**: `maxStepsPerRun`, `maxRetriesPerTask` (or equivalent)
- **Tools**:
  - allowed write paths (write scopes)
  - tool enablement flags (e.g., TypeScript diagnostics)
- **Logging**: level, format

## Definition of Done (DoD)

- If required env/runtime parameters are missing, `control-plane bootstrap` fails **before** any side effects.
- Logs contain no secrets (verify redaction).
- Config is available for runtime DI/composition (Phase 0).

## Test plan

- Unit:
  - required field validation
  - defaults and normalization
  - secret redaction
- Integration:
  - run `control-plane bootstrap` with valid and invalid environments (verify exit codes)

## Documentation links

- Spec v3: Phase 0 — Initialization: [`docs/ai-orchestrator-spec-v3.md` §15.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Safety — provider secrets: [`docs/ai-orchestrator-spec-v3.md` §23.4](../../docs/ai-orchestrator-spec-v3.md)
- Full spec (stack reference): [`docs/ts-linq-ai-orchestrator-full-spec.md` §18](../../docs/ts-linq-ai-orchestrator-full-spec.md)

