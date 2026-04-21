# Target plan — полный план реализации (на основе docs)

Ниже — целевой план работ, агрегированный из спецификаций и roadmap в `docs/`.
Приоритеты:
- **P0** — блокеры production (сначала)
- **P1** — ядро автономного выполнения и delivery
- **P2** — операционная зрелость и масштабирование
- **P3** — premium/enterprise возможности

## Порядок выполнения по волнам
1. **Wave 1 (P0):** задачи 01–08
2. **Wave 2 (P1):** задачи 09–18
3. **Wave 3 (P2):** задачи 19–23
4. **Wave 4 (P3):** задачи 24–26

## Матрица задач

| ID | Приоритет | Название | Файл |
|---|---|---|---|
| 01 | P0 | Исправить семантику runTask(taskId) | `01-исправить-семантику-runtasktaskid.md` |
| 02 | P0 | Устранить дедлок при split задач | `02-устранить-дедлок-при-split-задач.md` |
| 03 | P0 | Ввести полный реестр схем выходов ролей | `03-ввести-полный-реестр-схем-выходов-ролей.md` |
| 04 | P0 | Усилить глубокую валидацию ProjectState | `04-усилить-глубокую-валидацию-projectstate.md` |
| 05 | P0 | Закрыть базовые пробелы API-безопасности | `05-закрыть-базовые-пробелы-api-безопасности.md` |
| 06 | P0 | Добавить redaction секретов в логи/промпты | `06-добавить-redaction-секретов-в-логи-промпты.md` |
| 07 | P0 | Стабилизировать runtime-config и bootstrap-проверки | `07-стабилизировать-runtime-config-и-bootstrap-проверки.md` |
| 08 | P0 | Расширить smoke/e2e регрессии критичных инвариантов | `08-расширить-smoke-e2e-регрессии-критичных-инвариантов.md` |
| 09 | P1 | Внедрить ToolExecutionContext | `09-внедрить-toolexecutioncontext.md` |
| 10 | P1 | Реализовать action-loop агента (think-act-observe) | `10-реализовать-action-loop-агента-think-act-observe.md` |
| 11 | P1 | Рефакторинг packages/tools на typed adapters | `11-рефакторинг-packages-tools-на-typed-adapters.md` |
| 12 | P1 | Ввести безопасный write pipeline | `12-ввести-безопасный-write-pipeline.md` |
| 13 | P1 | Добавить workspace manager | `13-добавить-workspace-manager.md` |
| 14 | P1 | Интегрировать build/lint/typecheck/test стадии | `14-интегрировать-build-lint-typecheck-test-стадии.md` |
| 15 | P1 | Реализовать git lifecycle: branch/commit/pr-draft | `15-реализовать-git-lifecycle-branch-commit-pr-draft.md` |
| 16 | P1 | Добавить durable run-step log | `16-добавить-durable-run-step-log.md` |
| 17 | P1 | Собрать approval-gate lifecycle | `17-собрать-approval-gate-lifecycle.md` |
| 18 | P1 | Улучшить planner до нормализованного backlog graph | `18-улучшить-planner-до-нормализованного-backlog-graph.md` |
| 19 | P2 | Ввести policy engine исполнения | `19-ввести-policy-engine-исполнения.md` |
| 20 | P2 | Поднять observability: metrics + traces + audit views | `20-поднять-observability-metrics-+-traces-+-audit-views.md` |
| 21 | P2 | Реализовать recovery: DLQ + resume/replay | `21-реализовать-recovery-dlq-+-resume-replay.md` |
| 22 | P2 | Выделить scheduler/worker архитектуру | `22-выделить-scheduler-worker-архитектуру.md` |
| 23 | P2 | Укрепить QA-матрицу реальными репо-фикстурами | `23-укрепить-qa-матрицу-реальными-репо-фикстурами.md` |
| 24 | P3 | Реализовать multitenancy в state/API | `24-реализовать-multitenancy-в-state-api.md` |
| 25 | P3 | Добавить модельную стратегию и cost controls | `25-добавить-модельную-стратегию-и-cost-controls.md` |
| 26 | P3 | Собрать premium UX: dashboard evidence & review bundle | `26-собрать-premium-ux-dashboard-evidence-&-review-bundle.md` |
