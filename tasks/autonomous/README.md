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
