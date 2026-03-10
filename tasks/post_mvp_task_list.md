## Post-MVP: AI Orchestrator — task list

### Sources

- Main roadmap: [`docs/ai-orchestrator-spec-v3.md`](../docs/ai-orchestrator-spec-v3.md)
- Production RFC: [`docs/ai-orchestrator-rfc-v4.md`](../docs/ai-orchestrator-rfc-v4.md)
- Additional production context: [`docs/ts-linq-ai-orchestrator-full-spec.md`](../docs/ts-linq-ai-orchestrator-full-spec.md)

### Delivery rules

- One task = one feature branch
- One task = one commit
- Each task must include tests
- After each task: run `npm run lint`, `npm run typecheck`, and the relevant test suite
- Any backend/API work must be implemented with NestJS

### Recommended sequence

1. [`tasks/post-mvp/01-runtime-hardening-refactor.md`](post-mvp/01-runtime-hardening-refactor.md)
2. [`tasks/post-mvp/02-bootstrap-analyst-role.md`](post-mvp/02-bootstrap-analyst-role.md)
3. [`tasks/post-mvp/03-architect-role.md`](post-mvp/03-architect-role.md)
4. [`tasks/post-mvp/04-planner-role.md`](post-mvp/04-planner-role.md)
5. [`tasks/post-mvp/05-task-splitting-automation.md`](post-mvp/05-task-splitting-automation.md)
6. [`tasks/post-mvp/06-docs-writer-role.md`](post-mvp/06-docs-writer-role.md)
7. [`tasks/post-mvp/07-release-readiness-auditor-role.md`](post-mvp/07-release-readiness-auditor-role.md)
8. [`tasks/post-mvp/08-state-steward-role.md`](post-mvp/08-state-steward-role.md)
9. [`tasks/post-mvp/09-integration-manager-role.md`](post-mvp/09-integration-manager-role.md)
10. [`tasks/post-mvp/10-dashboard-api-nestjs-bootstrap.md`](post-mvp/10-dashboard-api-nestjs-bootstrap.md)
11. [`tasks/post-mvp/11-dashboard-query-endpoints.md`](post-mvp/11-dashboard-query-endpoints.md)
12. [`tasks/post-mvp/12-postgresql-state-backend.md`](post-mvp/12-postgresql-state-backend.md)
13. [`tasks/post-mvp/13-richer-repo-analysis.md`](post-mvp/13-richer-repo-analysis.md)
14. [`tasks/post-mvp/14-richer-diagnostics.md`](post-mvp/14-richer-diagnostics.md)
15. [`tasks/post-mvp/15-typescript-server-integration.md`](post-mvp/15-typescript-server-integration.md)
16. [`tasks/post-mvp/16-granular-health-tracking.md`](post-mvp/16-granular-health-tracking.md)
17. [`tasks/post-mvp/17-richer-exports.md`](post-mvp/17-richer-exports.md)

### Dependency map

- `01` is a hard prerequisite for all production-grade post-MVP tasks.
- `02` → `03` → `04` form the discovery/architecture/planning chain.
- `05` depends on `04` and existing workflow/retry policy.
- `06`, `07`, `08`, `09` depend on the role registry and runtime hardening from `01`.
- `10` is the base for all dashboard/API work.
- `11` depends on `10` and stable read models from `01`.
- `12` depends on `01` and should precede large-scale API/reporting work if production persistence is required early.
- `13`, `14`, `15`, `16` extend diagnostics/tooling and can partially run in parallel after `01`.
- `17` depends on `09`, `11`, and optionally `12`.

### Deferred long-term backlog

- distributed workers
- queue-backed execution
- safe parallel task execution
- advanced policy engines
- multi-project support
- deeper analytics and replay
