# Target plan — complete implementation plan (based on docs)

Below is the target work plan aggregated from specifications and roadmap documents in `docs/`.
Priorities:
- **P0** — production blockers (first)
- **P1** — core autonomous execution and delivery
- **P2** — operational maturity and scaling
- **P3** — premium/enterprise capabilities

## Execution order by waves
1. **Wave 1 (P0):** tasks 01–08
2. **Wave 2 (P1):** tasks 09–18
3. **Wave 3 (P2):** tasks 19–23
4. **Wave 4 (P3):** tasks 24–26

## Task matrix

| ID | Priority | Title | File |
|---|---|---|---|
| 01 | P0 | Fix runTask(taskId) semantics | `01-fix-runtask-taskid-semantics.md` |
| 02 | P0 | Resolve deadlock during task splitting | `02-resolve-task-split-deadlock.md` |
| 03 | P0 | Introduce full role output schema registry | `03-introduce-role-output-schema-registry.md` |
| 04 | P0 | Strengthen deep ProjectState validation | `04-strengthen-deep-projectstate-validation.md` |
| 05 | P0 | Close baseline API security gaps | `05-close-api-security-gaps.md` |
| 06 | P0 | Add secret redaction in logs/prompts | `06-add-secret-redaction-in-logs-prompts.md` |
| 07 | P0 | Stabilize runtime-config and bootstrap checks | `07-stabilize-runtime-config-and-bootstrap-checks.md` |
| 08 | P0 | Expand smoke/e2e regression for critical invariants | `08-expand-smoke-e2e-regression-for-critical-invariants.md` |
| 09 | P1 | Introduce ToolExecutionContext | `09-introduce-tool-execution-context.md` |
| 10 | P1 | Implement agent action-loop (think-act-observe) | `10-implement-agent-action-loop-think-act-observe.md` |
| 11 | P1 | Refactor packages/tools to typed adapters | `11-refactor-packages-tools-to-typed-adapters.md` |
| 12 | P1 | Introduce safe write pipeline | `12-introduce-safe-write-pipeline.md` |
| 13 | P1 | Add workspace manager | `13-add-workspace-manager.md` |
| 14 | P1 | Integrate build/lint/typecheck/test stages | `14-integrate-build-lint-typecheck-test-stages.md` |
| 15 | P1 | Implement git lifecycle: branch/commit/pr-draft | `15-implement-git-lifecycle-branch-commit-pr-draft.md` |
| 16 | P1 | Add durable run-step log | `16-add-durable-run-step-log.md` |
| 17 | P1 | Build approval-gate lifecycle | `17-build-approval-gate-lifecycle.md` |
| 18 | P1 | Upgrade planner to normalized backlog graph | `18-upgrade-planner-to-normalized-backlog-graph.md` |
| 19 | P2 | Introduce execution policy engine | `19-introduce-execution-policy-engine.md` |
| 20 | P2 | Improve observability: metrics + traces + audit views | `20-improve-observability-metrics-traces-audit-views.md` |
| 21 | P2 | Implement recovery: DLQ + resume/replay | `21-implement-recovery-dlq-resume-replay.md` |
| 22 | P2 | Separate scheduler/worker architecture | `22-separate-scheduler-worker-architecture.md` |
| 23 | P2 | Strengthen QA matrix with real repository fixtures | `23-strengthen-qa-matrix-with-real-repo-fixtures.md` |
| 24 | P3 | Implement multitenancy in state/API | `24-implement-multitenancy-in-state-api.md` |
| 25 | P3 | Add model strategy and cost controls | `25-add-model-strategy-and-cost-controls.md` |
| 26 | P3 | Build premium UX: dashboard evidence & review bundle | `26-build-premium-ux-dashboard-evidence-review-bundle.md` |
