# AI Orchestrator — Gap Analysis, Prioritized Task List, and Target Production Architecture

_Date: 2026-04-21_

## 1) Что уже реализовано (сверка docs vs code)

На базе `docs/ai-orchestrator-implementation-plan.md`, `docs/runtime-architecture.md` и текущего кода:

### Уже есть
- Модульная runtime-архитектура с разделением `core/application/execution/workflow/state/agents/tools`.
- Durable state + SQLite/InMemory adapters.
- Базовый orchestration cycle (выбор задачи → prompt → execution → review/test → commit state).
- API read model слой (`dashboard-api`) и CLI control-plane.
- Базовые политики workflow: retry/split/block.
- Набор тестов для ключевых сценариев.

### Частично реализовано / пробелы
- **Task targeting control-plane**: ранее не было гарантированного API/CLI для запуска конкретной задачи по `taskId`.
- **Tool execution loop**: отсутствует полноценный think/act/observe multi-step loop с доказательной телеметрией каждого tool action.
- **Repository mutation pipeline**: нет production pipeline для branch/commit/PR lifecycle внутри оркестратора.
- **Security hardening**: нет auth/RBAC/tenant isolation для dashboard API.
- **Operational maturity**: ограниченная observability (нет полноценного metrics/tracing/alerts SLO уровня).

## 2) Приоритизированный task list

Ниже приоритет в порядке выполнения (P0 -> P3).

## P0 — Blockers для production
1. **Guaranteed task execution targeting** (run конкретной задачи по ID с валидацией executable state).
2. **State-machine safety hardening** (строгие preconditions/postconditions на transitions и failure paths).
3. **Execution evidence baseline** (единая модель артефактов evidence: command/result/files/diff/test summary).
4. **API security baseline** (authN/authZ, CORS tightening, rate limit).

## P1 — Core production capability
5. **Tool action loop v1** (многошаговый цикл role <-> tools <-> observation).
6. **Sandboxed workspace abstraction** (изолированные workspaces на run).
7. **Repository mutation adapters** (git read/write, patch apply, dry-run validation).
8. **Policy gates** (human approvals для risky actions: delete/migration/dependency bump).

## P2 — Delivery/operations acceleration
9. **Observability stack** (structured metrics + tracing correlations по runId/taskId).
10. **Queue/worker separation** (async execution model, retries/poison queue).
11. **Read model expansion** (операционные dashboards: MTTR, retry heatmap, blocker taxonomy).

## P3 — Scale and enterprise readiness
12. **Multi-tenancy model** (org/project scoped isolation).
13. **Advanced governance** (audit policy bundles, compliance exports).
14. **Release automation hooks** (quality gates + release orchestration).

## 3) Target production-ready architecture

## 3.1 Logical layers
- **Domain (`packages/core`)**: entities, invariants, workflow contracts, decision/failure/evidence model.
- **Application (`packages/application`)**: use-cases/control-plane orchestration APIs, read models.
- **Execution (`packages/execution`)**: run engine, stage transitions, role invocation lifecycle.
- **Agent runtime (`packages/agents` + `packages/prompts`)**: role contracts + structured outputs.
- **Tooling (`packages/tools`)**: filesystem/shell/git/ts/test adapters через capability profile.
- **Infrastructure (`packages/state`, apps/*)**: persistence + API/CLI transport.

## 3.2 Runtime sequence (target)
1. Select executable task (or forced task).
2. Build role context + constraints.
3. Run iterative tool loop with bounded steps.
4. Persist evidence snapshots per step.
5. Review/test gates.
6. Apply repo mutation policy.
7. Commit state + publish events/read models.

## 3.3 Non-functional requirements
- **Safety**: deny-by-default tool capabilities, strict allowed paths.
- **Reliability**: deterministic retries, idempotent state writes.
- **Observability**: traceable run graph by runId/taskId.
- **Security**: RBAC + tenant-aware data access.
- **Evolvability**: schema-first contracts and backward-compatible read models.

## 4) Что уже начато в этой итерации

Реализован P0.1:
- Добавлен механизм forced task execution в `Orchestrator.runCycle({ forcedTaskId })`.
- Добавлена CLI команда `run-task --task-id <id>`.
- Добавлены тесты на forced execution и fail-fast в CLI.

