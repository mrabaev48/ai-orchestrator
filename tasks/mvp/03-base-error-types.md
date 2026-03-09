# 03 — Base error types (domain + orchestration)

## Goal

Standardize system errors (domain/orchestration/infra) so that:
- the CLI returns correct exit codes
- the workflow can classify errors (retryable / non-retryable / needs_human)
- errors are loggable and serializable without leaking secrets

## Context and business logic

In Phase 0 (Initialization), configuration errors are hard-fail. During execution, tool/provider errors influence retry/split/escalation and must be recorded into `FailureRecord`/events per policy.

## Requirements

### Functional

- Introduce an error hierarchy:
  - `ConfigError`
  - `StateStoreError`
  - `WorkflowPolicyError`
  - `ToolExecutionError`
  - `LlmProviderError`
  - `SchemaValidationError`
  - `SafetyViolationError` (tool profile / write scope violation)
- Each error includes:
  - machine-readable `code`
  - human-readable `message`
  - `cause` (without exposing secrets)
  - flags: `retrySuggested`, `needsHumanDecision` (if applicable)
- Map errors to:
  - exit code (CLI)
  - `FailureRecord.reason` / `symptoms` (state)

### Non-functional

- Serialization does not expose secrets.
- Errors are suitable for later analytical review (categorization).

## Stack

- TypeScript
- (Optional) use `Error` cause (`{ cause }`) + custom fields

## Implementation details

- `packages/shared/errors/*`
  - base `OrchestratorError extends Error`
  - error code types/enums
  - `isRetryable(error)` / `toFailureRecord(error, ctx)`
- `apps/control-plane`:
  - unified error handler for CLI commands

## Definition of Done (DoD)

- Configuration errors stop startup (Phase 0).
- LLM/Tool errors are classified correctly for retry policy.
- The CLI returns a non-zero exit code for orchestrator failures.

## Test plan

- Unit:
  - retryable/non-retryable classification
  - secret-safe serialization
- Integration:
  - artificially generate `LlmProviderError` and verify failure recording + correct stop

## Documentation links

- Spec v3: Phase 0 failure cases (invalid config → hard fail): [`docs/ai-orchestrator-spec-v3.md` §15.1](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Safety rules / provider safety: [`docs/ai-orchestrator-spec-v3.md` §23](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: CLI rules (non-zero exit codes): [`docs/ai-orchestrator-spec-v3.md` §20.3](../../docs/ai-orchestrator-spec-v3.md)

