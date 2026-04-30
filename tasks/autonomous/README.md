# Autonomous Production-Ready Task Breakdown

This folder contains a detailed implementation backlog to cover the full autonomous roadmap from `docs/autonomous/spec.md` and `docs/autonomous/pland.md`.

## Coverage
- **Phase 0** Baseline & readiness: tasks `01`-`03`
- **Phase 1** Safety core: tasks `04`-`16`
- **Phase 2** Autonomous action loop: tasks `17`-`24`
- **Phase 3** Repository mutation pipeline: tasks `25`-`30`
- **Phase 4** Reliability/recovery/queueing: tasks `31`-`33`
- **Phase 5** Security/multi-tenancy/governance: tasks `34`-`36`
- **Phase 6** Observability/SLO/operations: tasks `37`-`40`
- **Phase 7** Controlled rollout: tasks `41`-`44`

## Sequencing rules
1. Complete tasks in numeric order unless an explicit dependency exception is documented.
2. Do not start mutation automation tasks (`25+`) before safety and idempotency tasks (`04-24`) are done.
3. Do not enable high-risk autonomy levels before security and observability tasks (`34-40`) are done.

## Minimum completion quality for each task
- typed contract updates (if contract-related)
- unit tests for success/failure paths
- execution-safety tests where applicable (retry/timeout/cancellation/idempotency)
- evidence and telemetry updates where side effects occur
- migration notes when changing state schema or persisted models


## Baseline invariants mini-sequence (tasks 1.1–1.5)

Use this strict order for the baseline-invariants slice to avoid dependency inversions:

1. **1.1 — Persisted policy decisions for side-effect actions**
   - **Why first:** establishes mandatory policy decision records that downstream evidence and dedup must reference.
   - **Primary outputs:** `ExecutionPolicyDecision` contract, persisted decisions, enforcement guard for side-effectful execution paths.
   - **Blockers if incomplete:** 1.2 cannot reliably link policy decisions in evidence; 1.3 cannot prove policy-authorized dedup-suppressed actions.

2. **1.2 — Append-only run-step evidence with checksum**
   - **Depends on:** 1.1.
   - **Why second:** creates canonical immutable evidence substrate where decisions, attempts, statuses, and checksums are recorded.
   - **Primary outputs:** append-only `RunStepEvidence`, checksum write/read verification, immutable storage semantics.
   - **Blockers if incomplete:** 1.4 cannot persist first-class timeout/cancellation outcomes; 1.5 cannot validate forensic invariants end-to-end.

3. **1.3 — Idempotency key flow for non-idempotent side effects**
   - **Depends on:** 1.1 (policy linkage), recommended after 1.2 (evidence linkage).
   - **Why third:** introduces deterministic dedup protection before timeout/cancellation retry semantics are tightened.
   - **Primary outputs:** canonical idempotency key builder, dedup registry checks, guarded commit/push/PR side effects.
   - **Blockers if incomplete:** 1.4 retries after timeout risk duplicate side effects; 1.5 duplicate-protection regression case is not satisfiable.

4. **1.4 — Explicit timeout and cancellation evidence states**
   - **Depends on:** 1.2 and 1.3.
   - **Why fourth:** timeout/cancellation outcomes require both immutable evidence and dedup-safe recovery behavior.
   - **Primary outputs:** `timed_out`/`cancelled` evidence statuses, compensating checkpoint metadata, structured timeout/cancel errors.
   - **Blockers if incomplete:** 1.5 cannot validate timeout/cancellation invariants or safe post-timeout retry behavior.

5. **1.5 — Baseline invariant regression test suite**
   - **Depends on:** 1.1, 1.2, 1.3, 1.4.
   - **Why last:** serves as the acceptance gate for the whole baseline slice.
   - **Primary outputs:** deterministic suite covering success/failure/regression/timeout-cancellation invariant paths.

### Gating policy for execution
- Treat **1.5** as the release gate for the baseline-invariants slice.
- Do not mark phase-complete until all 1.1–1.5 tasks are implemented and passing in CI.
- If any upstream task is partially delivered, downstream tasks may be prepared but must remain in draft state.
