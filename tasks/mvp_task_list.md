## MVP: AI Orchestrator — список задач (по спецификации v3)

### Источники требований

- Основной документ: [`docs/ai-orchestrator-spec-v3.md`](../docs/ai-orchestrator-spec-v3.md)
- Доп. контекст (при необходимости сверки формулировок): [`docs/ts-linq-ai-orchestrator-full-spec.md`](../docs/ts-linq-ai-orchestrator-full-spec.md)

### Определение MVP (выжимка)

- **Состав MVP**: core packages, роли, state, workflow, CLI, prompt system, observability. Док: [Spec v3 §24.1](../docs/ai-orchestrator-spec-v3.md)
- **Критерии успеха MVP**: запуск runtime, инициализация state, выбор task, генерация prompt, цикл role→review→test, commit state, запись failures, экспорт backlog. Док: [Spec v3 §24.2](../docs/ai-orchestrator-spec-v3.md)

---

## `packages/shared`

- [ ] **Конфигурация runtime (typed config)**: загрузка env/файла, валидация, дефолты (provider, limits, paths). Док: [Spec v3 §15.1](../docs/ai-orchestrator-spec-v3.md)
  - DoD:
    - Конфиг валидируется до старта исполнения.
    - Ошибки конфигурации приводят к hard-fail (не частичному запуску).
- [ ] **Логгер (структурированный)**: единый интерфейс логирования для всех пакетов и приложений. Док: [Spec v3 §22.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Базовые ошибки/типы ошибок**: ошибки конфигурации, ошибки провайдера, ошибки state, ошибки политики workflow. Док: [Spec v3 §15.1, §23](../docs/ai-orchestrator-spec-v3.md)

## `packages/core`

- [ ] **Доменные типы `ProjectState`** (контракт + инварианты ссылок): `execution`, `repoHealth`, `architecture`, `backlog`, `milestones`, `decisions`, `failures`, `artifacts`. Док: [Spec v3 §9.1](../docs/ai-orchestrator-spec-v3.md)
  - DoD:
    - Есть явные типы для всех вложенных структур (без `any`).
    - Есть функция/сервис валидации инвариантов state (см. “правила” в §9.1).
- [ ] **Модели backlog**: `Epic`, `Feature`, `BacklogTask` (kind/status/priority/dependsOn/acceptanceCriteria/affectedModules/estimatedRisk). Док: [Spec v3 §9.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Модель milestone**: `Milestone` + правила (один `in_progress`, entry/exit criteria). Док: [Spec v3 §9.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Decision log**: `DecisionLogItem` + правила “почему”, неизменяемость. Док: [Spec v3 §9.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Failure record**: `FailureRecord` + правила влияния на retry/split/escalation. Док: [Spec v3 §9.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Artifact record**: `ArtifactRecord` (типы summary/report/export/plan/…) + хранение ссылок/метаданных. Док: [Spec v3 §9.6](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Доменные события**: базовый `DomainEvent` + перечень типов (BOOTSTRAP_COMPLETED, TASK_SELECTED, …). Док: [Spec v3 §10.5, §22.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Контракты ролей**: `AgentRole`, `RoleRequest`, `RoleResponse`, `AgentRoleName`, `RoleExecutionContext`. Док: [Spec v3 §11.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Контракты review/testing**: `ReviewResult`, `TestExecutionResult` (минимум для MVP-gate). Док: [Spec v3 §15.9–§15.10](../docs/ai-orchestrator-spec-v3.md)

## `packages/state`

- [ ] **Интерфейс `StateStore` (порт)**: `load/save`, `recordEvent`, `recordFailure`, `markTaskDone` (и нужные расширения под MVP). Док: [Spec v3 §27.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **In-memory store** для тестов/локального прогона. Док: [Spec v3 §24.1 (State)](../docs/ai-orchestrator-spec-v3.md)
- [ ] **PostgreSQL store**: реализация persistence backend для MVP. Док: [Spec v3 §10.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Схема таблиц (минимум)**: `project_snapshots`, `domain_events`, `decision_log`, `failure_log`, `artifact_log`. Док: [Spec v3 §10.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Snapshot policy**: когда делаем snapshot (bootstrap, task completion, milestone completion, и т.п.). Док: [Spec v3 §10.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Event policy**: что обязано эмититься как event на каждом этапе. Док: [Spec v3 §10.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Атомарность commit state (app-level)**: операции записи (events + snapshot + status updates) не оставляют систему в полу-состоянии. Док: [Spec v3 §15.11](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Валидация переходов статусов task/milestone** на сохранении state (rejection invalid transitions). Док: [Spec v3 §17.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Санитизация секретов**: исключить утечки provider secrets в логах/сохранениях. Док: [Spec v3 §19.3, §23.4](../docs/ai-orchestrator-spec-v3.md)

## `packages/workflow`

- [ ] **Тип `WorkflowStage` + state machine**: реализовать этапы и допустимые переходы в MVP. Док: [Spec v3 §13.2–§13.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Stop conditions**: `maxStepsPerRun`, 3 фейла таска, деградация health, needs_human, integrity uncertain. Док: [Spec v3 §13.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Retry policy**: 1-й фейл → retry, 2-й → split, 3-й → block+escalate (MVP: хотя бы retry/block). Док: [Spec v3 §13.4, §15.12, §17.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Task router (kind→role)**: маппинг task kind в role. Док: [Spec v3 §13.6](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Policy: review gate** (когда обязателен review, когда может быть пропущен). Док: [Spec v3 §17.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Policy: testing gate** (когда обязателен test, когда допускается reduced). Док: [Spec v3 §17.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Проверка milestone completion** по exit criteria, и активация следующего. Док: [Spec v3 §15.13, §9.3](../docs/ai-orchestrator-spec-v3.md)

## `packages/prompts`

- [ ] **Тип `OptimizedPrompt`** и минимальный schema-ориентированный контракт. Док: [Spec v3 §12.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Prompt pipeline**: template selection → context selection → constraints → failure-aware modifiers → schema injection. Док: [Spec v3 §12.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Набор базовых шаблонов** для MVP-ролей (Manager/PromptEngineer/TaskManager/Coder/Reviewer/Tester). Док: [Spec v3 §24.1 (Prompt system)](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Правила prompt construction** (минимальный контекст, acceptance criteria, anti-patterns, schema). Док: [Spec v3 §12.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Failure-aware модификаторы**: прошлые `FailureRecord` превращаются в constraints/anti-patterns. Док: [Spec v3 §12.4, §15.12](../docs/ai-orchestrator-spec-v3.md)

## `packages/llm`

- [ ] **Интерфейс `LlmClient`** (structured output generation). Док: [Spec v3 §27.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Mock LLM adapter** (детерминированные ответы для тестов workflow/agents). Док: [Spec v3 §26 (Step 7), §24.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Реестр схем structured output** (минимум: `OptimizedPrompt`, `ReviewResult`, `TestExecutionResult`). Док: [Spec v3 §12.2, §15.9–§15.10](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Обработка ошибок провайдера**: timeouts/invalid schema/safety blocks, без утечек секретов. Док: [Spec v3 §23.4, §15.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Минимальная интеграция 1 провайдера** (чтобы MVP “жил”; конкретика зависит от выбранного провайдера). Док: [Spec v3 §28](../docs/ai-orchestrator-spec-v3.md)

## `packages/tools`

- [ ] **Контракты адаптеров инструментов**: `FileSystemTool`, `GitTool`, `TypeScriptTool`, `SqlTool`, `DocsTool`. Док: [Spec v3 §21.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Tool profiles по ролям** (enforcement на уровне execution context). Док: [Spec v3 §11.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **FilesystemTool (read/write scoping)**: запрет на запись вне разрешённых путей. Док: [Spec v3 §23.3, §21.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **TypeScriptTool**: запуск typecheck/diagnostics (минимум для MVP health). Док: [Spec v3 §5.1, §21.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **GitTool (read-only для MVP)**: status/diff/currentBranch (без push/merge). Док: [Spec v3 §21.2, §3.3](../docs/ai-orchestrator-spec-v3.md)

## `packages/agents` (только MVP-роли)

- [ ] **Role registry**: регистрация ролей и безопасный доступ по `AgentRoleName`. Док: [Spec v3 §15.1 (register roles), §11.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Manager**: единая точка координации (select task → prompt → execute → review → test → commit). Док: [Spec v3 §5.2, §14.1–§14.2](../docs/ai-orchestrator-spec-v3.md)
  - DoD:
    - Соблюдаются gate’ы review/testing.
    - Фейлы пишутся в state и влияют на retry.
- [ ] **Prompt Engineer**: `optimize()` генерирует `OptimizedPrompt` с constraints и schema. Док: [Spec v3 §12, §27.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Task Manager**: `selectNextTask()` (фильтр milestone/deps/blocked + приоритеты + retry history). Док: [Spec v3 §15.6, §27.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Coder** (MVP-реализация как role wrapper): исполняет bounded implementation через инструменты (в MVP допустим stub/no-op, но контракт должен быть). Док: [Spec v3 §11.2, §15.8](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Reviewer**: возвращает `ReviewResult` с классификацией blocker/non-blocker. Док: [Spec v3 §15.9, §12.5 (anti-patterns)](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Tester**: возвращает `TestExecutionResult` + test plan/сценарии. Док: [Spec v3 §15.10](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Guardrails enforcement**: coder не может approve, reviewer/tester не могут писать в repo; нельзя пропускать gates при изменениях. Док: [Spec v3 §23.2, §17.3–§17.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Запись артефактов** (минимум): optimized prompt, run summary, экспорт backlog. Док: [Spec v3 §9.6, §22.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Эскалация needs_human**: формат и причины остановки (MVP: хотя бы структурированная запись/артефакт). Док: [Spec v3 §17.6, §13.5](../docs/ai-orchestrator-spec-v3.md)

## `packages/execution`

- [ ] **Orchestrator loop** (runCycle) как композиция store/registry/prompt/task/workflow. Док: [Spec v3 §27.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Execution context factory**: формирование `RoleExecutionContext` с tool profile. Док: [Spec v3 §11.2, §14.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Schema validation step**: reject/repair once для невалидных structured outputs. Док: [Spec v3 §15.8](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Run modes (MVP минимум)**: single-cycle. Док: [Spec v3 §14.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Run summaries** (минимум): cycle_start/end, выбранный task/role, результат review/test, причины stop. Док: [Spec v3 §22.1, §24.1 (Observability)](../docs/ai-orchestrator-spec-v3.md)

## `apps/control-plane`

- [ ] **CLI `bootstrap`**: инициализация runtime + первичный state + snapshot. Док: [Spec v3 §20.1, §15.2, §10.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **CLI `run-cycle`**: выполнить один цикл с соблюдением stop conditions. Док: [Spec v3 §20.1, §14.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **CLI `show-state`**: вывод краткого state (и/или JSON режим). Док: [Spec v3 §20.1, §19.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **CLI `export-backlog`**: экспорт backlog в markdown/JSON артефакт. Док: [Spec v3 §20.1, §24.1 (CLI)](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Exit codes + machine-readable output**: non-zero на ошибках оркестрации, опциональный JSON. Док: [Spec v3 §20.3](../docs/ai-orchestrator-spec-v3.md)

## Observability & Safety (MVP)

- [ ] **Логи обязательных событий**: cycle_start/end, task_selected, prompt_generated, role_executed, review_result, test_result, state_committed. Док: [Spec v3 §22.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Доменные события (минимум MVP-покрытия)**: BOOTSTRAP_COMPLETED, TASK_SELECTED, PROMPT_GENERATED, ROLE_EXECUTED, REVIEW_APPROVED/REJECTED, TEST_PASSED/FAILED, TASK_COMPLETED. Док: [Spec v3 §22.3, §10.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Профили доступа инструментов** реально ограничивают операции роли (не только “договорённость”). Док: [Spec v3 §11.2, §21.3](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Ограничение на бесконечные циклы**: caps (maxStepsPerRun, retry caps), запись причины stop. Док: [Spec v3 §13.5, §23.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **State integrity checks**: обнаружение “битых” ссылок/инвариантов и остановка/эскалация. Док: [Spec v3 §18.6, §13.5](../docs/ai-orchestrator-spec-v3.md)

## Tests (MVP)

- [ ] **Unit: workflow stage machine** (валидные/невалидные переходы). Док: [Spec v3 §13.3, §17.1](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Unit: task selection** (deps/blocked/priority/retry influence). Док: [Spec v3 §15.6, §17.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Unit: prompt pipeline** (constraints + failure-aware modifiers + schema injection). Док: [Spec v3 §12.3–§12.4](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Unit: schema validation** (reject + one repair attempt). Док: [Spec v3 §15.8](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Integration: StateStore PostgreSQL** (events + snapshots + failures). Док: [Spec v3 §10.3–§10.5](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Integration: runCycle happy path** (mock LLM, review/test pass → commit). Док: [Spec v3 §18.1, §24.2](../docs/ai-orchestrator-spec-v3.md)
- [ ] **Integration: reviewer rejection / tester failure** (failure recorded, retry counters). Док: [Spec v3 §18.2–§18.3, §9.5](../docs/ai-orchestrator-spec-v3.md)

