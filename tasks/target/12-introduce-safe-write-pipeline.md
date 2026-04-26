# Task 12 — Introduce a safe write pipeline

**Priority:** P1

Work on the `ai-orchestrator` repository.

Goal:
Add read-only/propose/sandbox/workspace/protected-write modes with centralized guardrail checks.

Instructions:
- First inspect the current architecture and identify the exact modules responsible for orchestration flow, tool execution, state transitions, and observability.
- Summarize the current design before making edits.
- Keep domain orchestration logic separate from provider-specific code.
- Preserve backward compatibility unless explicitly told otherwise.
- Prefer explicit typed contracts over implicit object shapes.
- Ensure retries, timeout handling, cancellation, and structured error propagation are addressed if the change touches execution flow.
- Update or add tests for happy path, failure path, and regression coverage.
- Run typecheck, lint, and relevant tests.
- At the end, report:
  - files changed
  - exact commands run
  - test results
  - remaining risks
  - git status
  - whether branch upstream / push / PR is configured

Do not:
- perform unrelated refactors
- claim validation passed unless it was actually run
- hide architectural tradeoffs

Response format:
1. Understanding
2. Architecture notes
3. Plan
4. Implementation
5. Validation
6. Risks
7. Git status

## Subtasks (risk decomposition)

- [ ] **12.1 — Add Redis/etcd LockAuthority adapters (port already extracted)**
  - file: `tasks/target/12.1-lock-authority-redis-etcd-adapters.md`
- [ ] **12.2 — Enforce shared `WORKFLOW_RUN_LOCK_DSN` for multi-worker mode**
  - file: `tasks/target/12.2-enforce-shared-run-lock-dsn-for-multi-worker.md`
- [ ] **12.3 — Operationalize lock fallback and misconfiguration diagnostics**
  - file: `tasks/target/12.3-lock-fallback-and-misconfiguration-diagnostics.md`
