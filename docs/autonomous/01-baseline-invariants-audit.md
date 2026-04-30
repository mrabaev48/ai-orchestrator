# Baseline Invariants Audit (Task 01)

## Scope

This audit compares the autonomous production spec against currently implemented runtime behavior in:

- `packages/core`
- `packages/application`
- `packages/execution`

Primary reference spec: `docs/autonomous/spec.md`.

## Method

We reviewed implementation entrypoints and evidence/policy/state surfaces, then mapped each required invariant to one of:

- **Covered** — implemented and observable in code.
- **Partial** — present but incomplete for the spec requirement.
- **Missing** — not implemented in current codepath.

## Invariants coverage matrix

| Invariant from spec | Status | Evidence in code | Gap summary |
|---|---|---|---|
| Single active milestone (`in_progress`) per project scope | **Partial** | Workflow stop logic and run locks exist, plus state assertions. | No explicit invariant contract discovered for "single active milestone" as a first-class rule with hard-fail transition enforcement. |
| Explicit closed transition table; illegal transitions hard-fail | **Partial** | `assertProjectState` is enforced before run execution. | Transition closure and illegal transition prevention are not represented as an explicit audited transition table in execution runtime. |
| Side-effectful action requires policy decision + evidence | **Partial** | `ExecutionPolicyEngine` resolves tool policy and role constraints; telemetry/events recorded. | Policy decision object (`allow/deny/requires_approval/defer`) with decision IDs is not persisted per side effect as required by spec. |
| Repeatable external effect requires idempotency key | **Missing** | No explicit idempotency-key registry/contract found in orchestration execution path. | Push/PR/tool side effects are not guarded by a typed idempotency key flow. |
| Evidence append-only, immutable, checksum-verified | **Missing** | Events/artifacts are recorded; telemetry has best-effort event persistence. | No `RunStepEvidence` append-only store/checksum verification contract found in current runtime. |
| Replay/resume appends facts and never mutates history | **Partial** | Retry split/task routing logic exists in workflow package. | No explicit recovery checkpoint protocol with replay-from markers and immutable historical proof. |

## Reliability semantics (retry/timeout/cancellation)

### Retry

- **Current**: retry-related decision helpers exist in workflow routing (`splitTaskForRetry`, failure actions).
- **Gap**: no explicit per-stage bounded retry policy surfaced in a typed autonomous execution contract (attempt caps/backoff/jitter linked to evidence).

### Timeout

- **Current**: tool calls pass through controlled execution pathways.
- **Gap**: no unified per-tool and per-stage timeout invariant documented/enforced with guaranteed timeout evidence records.

### Cancellation

- **Current**: `AbortSignal` can be provided to run cycle and execution context.
- **Gap**: explicit cancellation checkpoints and mandatory cancellation evidence are not represented as first-class contracts.

## Observability and diagnosability

### Present

- Structured events and metrics exist (`METRIC_RECORDED`, run/task metadata in logger context).
- Runtime includes lock-contention telemetry and run/task identifiers.

### Gaps

- No canonical `RunStepEvidence` contract implementation with attempt counters, mutation stages, validation slices, and integrity checksum.
- No explicit linkage between policy decisions/approval records and concrete side-effect actions.

## Minimal implementation slice recommended for next tasks

1. Introduce typed `ExecutionPolicyDecision` + persistence linkage in execution flow for side-effectful actions.
2. Introduce typed `RunStepEvidence` append operation (append-only), initially for one stage in `runTaskInWorkspace`.
3. Add idempotency key generation/registration for non-idempotent actions (commit/push/PR draft).
4. Add explicit timeout/cancellation evidence status (`timed_out`, `cancelled`) on step records.
5. Add baseline invariant tests:
   - success path (policy + evidence recorded),
   - failure path (policy deny hard-fail),
   - regression (duplicate side effect blocked by idempotency key),
   - cancellation/timeout evidence path.

## Risk classification

### Confirmed issues

- Missing typed idempotency key flow for external side effects.
- Missing append-only checksum-based run-step evidence contract.
- Missing persisted policy decision records tied to every side effect.

### Credible risks

- Duplicate execution under retry/replay for non-idempotent operations.
- Limited post-incident forensics due to partial evidence model.
- Cancellation/timeout may be harder to reconstruct deterministically.

### Optional improvements

- Promote transition invariants into a dedicated domain transition module with explicit illegal-transition errors.
- Add evidence integrity verification job to detect drift/corruption.

## Backward compatibility note

This audit is documentation-only and does not change runtime contracts.
