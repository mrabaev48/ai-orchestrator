
# AI Orchestrator — Documentation 1.40.0

## 1. Что это за проект

**AI Orchestrator** — это production-oriented TypeScript монорепозиторий для автономного/полуавтономного управления инженерным циклом задач:
- загрузка и валидация runtime-конфигурации;
- bootstrap состояния проекта;
- архитектурный анализ, планирование backlog, генерация документации;
- исполнение задач через orchestrator + role registry;
- контроль отказов, replay/resume;
- API-плоскость наблюдения и операционного управления (Dashboard API);
- worker-процесс для непрерывной обработки задач.

На уровне кода проект организован как набор приложений и пакетов доменного/прикладного/интеграционного назначения.

---

## 2. Состав репозитория

### 2.1 Apps

- `apps/control-plane` — CLI контрольной плоскости (bootstrap, run-cycle, run-task, экспорт, проверка состояния).
- `apps/worker` — long-running worker, который циклически вызывает orchestrator с таймаутами, backoff и graceful stop.
- `apps/dashboard-api` — NestJS HTTP API для чтения state/read-моделей, аудита, approvals и health-проверок.

### 2.2 Packages

- `packages/core` — доменные сущности/события/модели состояния (ProjectState, backlog, failures, milestones и т.д.).
- `packages/application` — прикладные сервисы use-case уровня (planning, docs, release readiness, control plane, dashboard query).
- `packages/execution` — Orchestrator, lock authority, workspace manager, telemetry и execution-policy.
- `packages/agents` — реестр ролей и дефолтные роли (planner, architect, coder, reviewer, tester и др.).
- `packages/state` — абстракции и реализации хранилища состояния (in-memory и PostgreSQL).
- `packages/shared` — runtime config, logging, error types и общие утилиты.
- `packages/prompts` — prompt pipeline и role-oriented prompt templates.

---

## 3. Что проект делает (функционально)

## 3.1 Control Plane (CLI)

Основной CLI-командный интерфейс поддерживает следующие сценарии:

- `bootstrap` — инициализирует состояние проекта.
- `analyze-architecture` — запускает архитектурный анализ.
- `plan-backlog` — генерирует план backlog.
- `generate-docs` — генерирует документацию-артефакты.
- `assess-release` — формирует оценку release readiness.
- `check-state` — проверка целостности state.
- `prepare-export` — подготовка integration export.
- `show-state` — вывод summary/raw состояния.
- `export-backlog` — экспорт backlog (md/json).
- `run-cycle` — один оркестрационный цикл.
- `run-task --task-id <id>` — исполнение конкретной задачи.
- `resume-failure --failure-id <id>` — возврат dead-lettered failure в resumed.
- `replay-failure --failure-id <id>` — replay task из checkpoint.


### 3.1.1 Dead-letter and controlled replay hardening (1.40.0)

- Replay path is now explicitly gated: `replay-failure` works only for `dead_lettered` failures.
- Replay checkpoint selection is isolated in execution queue controller (`selectReplayCheckpoint`) to keep policy/validation deterministic and typed.
- Queue recovery contracts are now explicit in state layer via `DeadLetterReplayStore` interface for adapter-safe extensions.

## 3.2 Orchestrator runtime

Execution-слой включает:
- bounded retries/step limits;
- timeout/cancellation через `AbortSignal`;
- telemetry counters/histograms;
- structured error propagation;
- append-only run-step logging с checksum-chain;
- workflow policy guards;
- git lifecycle automation (branch/commit/push/pr-draft) с approval gating.


### 3.2.2 Distributed run lock fencing tokens (1.41.0)

Добавлен минимальный production-ready слой fencing для distributed lock:
- в `packages/state` добавлен typed-контракт `DistributedLockStore` + `InMemoryDistributedLockStore` с монотонным `fencingToken`;
- acquire/release/validate возвращают структурированные причины (`already_locked`, `stale_fencing_token`, `owner_mismatch`, `expired`), что повышает diagnosability и безопасность retry/replay;
- в `packages/execution` добавлен `createFencingTokenGuard(...)`, который инкапсулирует acquire/validate/release с логированием и явной ошибкой `WorkflowPolicyError` при невалидном release.

Это снижает риск stale-owner выполнения и фиксирует явный контракт single-active-run поверх distributed lock механизма.

### 3.2.1 Run-step evidence integrity

Обновление 1.32.0: выделен отдельный append-only evidence слой (`RunStepEvidenceStore` + `appendRunStepEvidence`) и подключен в Orchestrator для централизованного вычисления checksum и append-записи в state store. Это зафиксировало явный контракт между execution/state слоями без изменения публичных payload-форматов.


Начиная с текущей реализации, записи run-step имеют расширенный evidence-контракт:

- `tenantId`, `projectId` (scope/изоляция арендатора и проекта);
- `stepId`, `attempt`, `idempotencyKey` (детерминизм и replay/повторные попытки);
- `traceId`, `policyDecisionId`, `payloadRef` (трассировка и связка с policy/артефактами);
- `checksum`, `prevChecksum` (криптографическая цепочка целостности).

Для checksum используется детерминированная canonical serialization + SHA-256.

Поведение read-path:

- при чтении истории через `listRunSteps({ runId })` выполняется проверка checksum-chain;
- при несоответствии выбрасывается ошибка `EVIDENCE_INTEGRITY_VIOLATION` (через `StateStoreError`) с деталями нарушений.

Это позволяет выявлять tampering и поддерживать forensic-grade реконструкцию последовательности шагов в рамках конкретного `runId`.


### 3.2.2 Idempotency key flow for non-idempotent side effects

Для non-idempotent действий git lifecycle (commit/push/pr-draft) введен сквозной dedup-контур:
- canonical idempotency key строится в формате `{tenant}:{project}:{run}:{task}:{stage}:{attempt}:{actionType-actionHash}`;
- в `execution.dedupRegistry` сохраняется состояние ключа: `pending|succeeded|failed|expired` и lease/TTL;
- перед side effect выполняется reserve, при duplicate выполняется deterministic short-circuit (`*_status=skipped_duplicate`);
- успешные/ошибочные завершения side effect фиксируются с policy/evidence linkage (`policyDecisionId`, `evidenceId`).

Это снижает риск повторного внешнего эффекта при retry/replay и улучшает диагностику причин suppression.


### 3.2.3 Explicit timeout/cancellation evidence states

Run-step evidence теперь поддерживает first-class статусы исполнения и восстановления:

- `timed_out` — шаг завершён по timeout, не сводится к generic failure;
- `cancellation_requested` — получен parent cancellation signal и начато распространение отмены;
- `cancelled` — шаг завершился отменой после propagation;
- `compensation_pending` / `compensated` — зарезервированы для явной фиксации компенсационных фаз после partial-failure.

Для timeout/cancel добавлены структурированные ошибки:
- `STEP_TIMEOUT` (`timeoutMs`, `boundary`, `elapsedMs`);
- `STEP_CANCELLED` (`requestedBy`, `requestedAt`, `propagationState`).

Это повышает diagnosability post-timeout/post-cancel сценариев и снижает риск некорректного retry-поведения, когда особые исходы теряются в `failed`.

Дополнительно введена **closed transition table** для run-step lifecycle и guard-проверка перед записью каждого нового evidence-события:
- начальный статус допускается только при первом событии attempt;
- переходы `cancellation_requested -> cancelled|compensation_pending` и `compensation_pending -> compensated|failed` разрешены явно;
- любые переходы из terminal-статусов (`succeeded|failed|timed_out|cancelled|compensated`) блокируются;
- при illegal transition выбрасывается `StateIntegrityError` с кодом `ILLEGAL_RUN_STEP_TRANSITION` и контекстом (`runId`, `stepId`, `attempt`, `evidenceId`).

Это устраняет неявные/двусмысленные state transitions и делает replay/forensics детерминированными.

Дополнительно доменный transition contract вынесен в отдельный модуль `run-step-transition-table` с API `getAllowedRunStepTransitions(...)`, что позволяет переиспользовать closed таблицу переходов в guard-слое и в тестах без дублирования правил.


### 3.2.4 Non-bypass policy checks in preflight/postflight and side effects

В orchestration flow введены обязательные policy-check точки, которые нельзя обойти:

- preflight check перед основной ролью исполнения (`task:{id}:preflight_policy`);
- перед каждым side-effectful git действием (`git_commit`, `git_push`, `pr_draft`) с persisted decision verification;
- postflight check перед финальной фиксацией состояния (`task:{id}:postflight_policy`).

Каждый check записывает `policyDecisionId`-связанное решение и выполняет read-after-write валидацию (`missing/stale/deny` => hard stop). Это закрывает класс обходов governance при прямых переходах control-flow к мутациям.

### 3.2.4 Baseline invariant regression suite (release gate 1.5)

Добавлен детерминированный regression-набор `baseline-invariants` как обязательный release gate для baseline-среза 1.1–1.4/1.5:

- success path: фиксированный policy-профиль и required checks;
- policy deny path: запрет write-доступа для read-only ролей;
- dedup suppression regression: подавление duplicate side effect после `succeeded`;
- timeout invariant: структурированный `STEP_TIMEOUT` с retry-safe семантикой;
- cancellation invariant: структурированный `STEP_CANCELLED` с propagation state;
- evidence integrity invariant: детект tampering checksum-chain через `EVIDENCE_INTEGRITY_VIOLATION`.

Suite запускается через `pnpm run test:baseline-invariants`; в turbo-пайплайне добавлена задача `baseline-invariants`, и `build` теперь зависит от нее (blocking gate).

### 3.2.6 Bounded ActionLoop step/wall-time budgets

Для ролей с `executeStep` (think-act-observe loop) включены два явных budget-ограничителя:

- `workflow.maxRoleStepsPerTask` — верхняя граница шагов action loop на одну задачу;
- `workflow.maxRoleWallTimeMs` — wall-time budget для всего role loop, проверяется перед каждым шагом.

Семантика остановки детерминирована и типизирована через `WorkflowPolicyError`:

- при исчерпании step budget: `Role <name> exceeded action loop step limit`;
- при исчерпании wall-time budget: `Role <name> exhausted action loop wall-time budget` с деталями (`step`, `elapsedMs`, `maxWallTimeMs`, `budgetType=wall_time_ms`).

Дополнительно шагу назначается bounded timeout: `min(llm.timeoutMs, remainingWallTimeMs)`, что предотвращает выход за общий wall-time budget из-за «длинного» отдельного шага и упрощает диагностику stop-condition в telemetry/evidence.

### 3.2.5 Initial autonomous SLI/SLO and error budget policy

Введён базовый production-ready слой для SLO governance автономных прогонов:
- typed SLI snapshot (`successRatePercent`, `timeoutRatePercent`, `cancellationRatePercent`, `p95LatencyMs`, `sampleSize`);
- default SLO policy `autonomous-default-v1` (success >= 99%, timeout <= 1%, cancellation <= 2%, p95 latency <= 120000ms);
- error budget policy (30 дней, budget 1%, warning при burn >= 70%);
- deterministic assessment output с verdict `healthy|at_risk`, criterion-level evidence и budget status `healthy|burn_warning|exhausted`.

Этот слой является минимальным инкрементом для Phase 6 (Observability/SLO) и может расширяться per-tenant/per-tier без breaking изменений текущих контрактов.


### 3.2.6 ExecutionPolicyDecision domain contract and validators

Для policy-decision слоя формализован единый доменный контракт и централизованные валидаторы:
- в `packages/core` введен schema-first контракт `executionPolicyDecisionSchema` + `validateExecutionPolicyDecision`; 
- валидация покрывает shape/типы, ISO timestamp, enum-ограничения, а также semantic rule: для `deny|error` обязателен минимум один `reasonCode`;
- в `validateProjectState` добавлена доменная проверка соответствия `policyDecisions` текущему tenant/project context;
- в `packages/application` добавлен `assertPolicyDecisionForAction` для детерминированной проверки missing/stale/deny перед side-effectful действиями.

Это снижает риск неявных/частично валидированных policy-решений и делает ошибки policy-layer воспроизводимыми для эксплуатационной диагностики.


### 3.2.7 Action-to-risk classification matrix with explicit ownership

Добавлена централизованная matrix-классификация рисков действий с явным ownership:
- execution policy actions (`artifact_write`, `external_api`, `git_commit`, `git_push`, `pr_draft`) классифицируются через единый typed matrix;
- approval actions (`db_migration`, `security_auth_change`, `production_config_change` и др.) классифицируются через отдельный typed matrix;
- каждое действие теперь имеет не только `riskLevel`, но и `owner` (`orchestration|release|security|platform`), что делает ответственность и эскалацию явными;
- orchestration-path перестал использовать hardcoded risk-level строки для git side effects, и использует матрицу как единственный source of truth;
- application-слой использует thin mapper-адаптер для чтения core matrix без дублирования правил.

Это снижает риск drift между policy-check, approval-flow и runtime side effects, а также улучшает diagnosability при инцидентном разборе.
### 3.2.8 Policy Engine Evaluator (allow/deny/requires_approval/defer)

Добавлен минимальный production-ready policy evaluator слой:
- единый typed outcome-контракт `PolicyOutcome` с исходами `allow|deny|requires_approval|defer`;
- deterministic evaluator `evaluatePolicy(...)` в application-слое, который учитывает risk-level, флаг обязательного approval, доступность policy backend и явные deny-коды;
- schema-first валидация outcome и state-level policy decision record (`PolicyDecisionRecord`) для консистентной персистенции/диагностики;
- non-allow outcomes всегда сопровождаются reason-кодами, а `allow` остается без reasonCodes для предсказуемой downstream-обработки.

Это формирует базовый contract для дальнейшей интеграции evaluator в execution preflight/postflight и side-effect checkpoints без breaking изменений в существующих runtime контрактах.

### 3.2.10 Preflight policy gate module as explicit non-bypass startup contract

Добавлен выделенный preflight policy gate модуль для старта исполнения задачи:
- `buildPreflightPolicyGateDecisionRequest(...)` формирует детерминированный payload для обязательного preflight check;
- payload фиксирует `task:{id}:preflight_policy`, `artifact_write`, `NON_BYPASS_PREFLIGHT_CHECK`, а также стабильный `inputHashSeed`;
- orchestration-path использует этот модуль перед любым role execution, что исключает неявный bypass preflight-проверки при дальнейших изменениях control flow.

Это уменьшает риск drift между документированным требованием non-bypass preflight и фактической реализацией в runtime.

### 3.2.11 RepoMutationPipeline with recoverable stages and compensation

В execution-слой добавлен выделенный `RepoMutationPipeline` как typed stage-runner для мутации репозитория:
- фиксированный порядок стадий `workspace_prepare -> branch_prepare -> change_apply -> verification -> commit_prepare -> push_prepare -> pr_draft_prepare -> finalize`;
- для каждой стадии задаются явные `timeoutMs`, `maxAttempts`, `execute(...)` и опциональная `compensate(...)`;
- stage evidence сохраняет `attempt`, `status`, `durationMs`, `errorCode/errorMessage`, metadata для postmortem и audit;
- retriable ошибки обрабатываются bounded retry, non-retriable/исчерпание попыток переводит pipeline в fail-fast;
- при fail на стадии с компенсацией выполняется explicit compensation record (`compensated`), что закрывает partial-success сценарии без silent corruption.

Это формирует production-ready фундамент для безопасного branch/apply/verify/commit/push/pr-draft цикла с детерминированной диагностикой.


### 3.2.12 Mandatory per-step policy gate before side-effect actions

Добавлен явный step-level policy gate модуль для side-effect стадий:
- `buildStepPolicyGateRequest(...)` формирует typed/deterministic request для каждого side-effect шага;
- orchestration-path использует его перед `git_commit`, `git_push`, `pr_draft`;
- risk-level заполняется только через централизованную classification matrix, без локальных hardcoded fallback;
- это делает per-step governance contract явным и снижает риск bypass/дрейфа при эволюции control flow.

### 3.2.13 Postflight policy gate module as explicit finalization contract



### 3.2.14 Cancellation propagation through execution and tool runtime

### 3.2.15 PR draft prepare stage with structured evidence bundle

В mutation stages добавлен выделенный `pr-draft-prepare` шаг (`pr_draft_prepare`) для подготовки draft PR как отдельного typed side-effect этапа:
- явная precondition-проверка `branchName` с non-retriable отказом `PR_DRAFT_PREPARE_BRANCH_REQUIRED`;
- success-path возвращает evidence bundle (`notes=draft_pr_created`) с метаданными `branchName`, `prNumber`, `prUrl`;
- error-path нормализован в структурированную retriable ошибку `PR_DRAFT_PREPARE_FAILED`;
- тестами покрыты success/failure/regression (missing branch) сценарии для детерминированной диагностики и безопасного retry-поведения.

Это завершает минимальный production-ready срез для `pr_draft_prepare` в mutation pipeline и делает контракт шага явным и проверяемым.

Усилена сквозная propagation-модель `AbortSignal` между execution и tools слоями:
- в `packages/execution` добавлен `propagateAbort(...)`, который формирует дочерний signal, переносит `reason` и гарантирует очистку listener-ов через `dispose`;
- retry-контур `executeWithRetry(...)` теперь использует отдельный дочерний signal на каждый attempt и на backoff sleep, что предотвращает скрытую утечку listener-ов и делает cancellation path детерминированным;
- в `packages/tools/runtime` добавлен `createAbortAwareSignal(...)` для typed preflight-проверки отмены и унифицированной propagation в tool timeout boundary;
- `withToolTimeout(...)` переведен на abort-aware helper, сохраняя `TOOL_CANCELLED`/`TOOL_TIMEOUT` ошибки как структурированные operational outcomes.

Это снижает риск расхождения cancellation-семантики между слоями и повышает diagnosability при прерывании долгих/повторяемых операций.

Для regression-контроля добавлены targeted unit/integration тесты на propagation и listener cleanup (`propagateAbort`, `createAbortAwareSignal`) в `tests/cancellation-propagation.test.ts`.

### 3.2.14 Tool timeout enforcement and stage timeout boundaries

Усилены timeout-гарантии на двух критичных границах исполнения:
- в tool runtime добавлен общий timeout-wrapper `withToolTimeout(...)`, который применяет единый per-tool deadline и нормализует ошибки в `TOOL_TIMEOUT` (`category=timeout`);
- timeout применяется на orchestration boundary независимо от поведения конкретного адаптера, что исключает зависание шага при игнорировании signal внутри инструмента;
- в `RepoMutationPipeline` stage timeout теперь enforced через `Promise.race(...)` + `AbortController`, поэтому stage не может бесконечно блокировать pipeline даже при некорректной реализации execute;
- evidence для stage timeout фиксируется как `STAGE_TIMEOUT`, что улучшает postmortem-диагностику и снижает риск неявных stuck-сценариев.

Изменение выполнено additively, без изменения публичных контрактов вызова toolset/pipeline.


### 3.2.15 Tool error normalization into retriable structured envelopes

В tool-runtime введена отдельная нормализация ошибок `normalizeToolError(...)`:
- typed ошибки `ToolExecutionContractError` пробрасываются без потери category/code/details;
- platform-level `AbortError` нормализуется в `TOOL_CANCELLED` (`category=cancelled`, `retriable=false`);
- прочие неизвестные ошибки приводятся к `execution` envelope с fallback-кодом (`TOOL_EXECUTION_FAILED`) и явным message.

Это делает retry/timeout/cancellation семантику стабильной на orchestration boundary и улучшает diagnosability в evidence-записях tool execution.


Добавлен выделенный postflight policy gate модуль для финализации исполнения задачи:
- `buildPostflightPolicyGateDecisionRequest(...)` формирует детерминированный payload для обязательной postflight check-точки;

### 3.2.14 Dedup guard for git push/PR side effects in autonomous flow

Для git side effects в автономном цикле закреплён production-ready dedup guard на уровнях `git_push` и `pr_draft`:
- перед `pushBranch(...)` и `createPullRequestDraft(...)` всегда выполняется idempotency reserve через `execution.dedupRegistry`;
- при уже зафиксированном успешном ключе side effect детерминированно подавляется (`pushStatus=skipped_duplicate`, `prStatus=skipped_duplicate`);
- suppression не приводит к скрытому выполнению внешних эффектов (нет повторного push/PR вызова);
- артефакты git lifecycle сохраняют явные статусы suppression, что улучшает forensic-разбор retry/replay сценариев.

Тестовое покрытие расширено отдельными сценариями для `runCycle`:
- duplicate `git_push` ключ блокирует повторный push и фиксирует корректный статус;
- duplicate `pr_draft` ключ блокирует повторное создание PR draft при успешно выполненном push.
- payload фиксирует `task:{id}:postflight_policy`, `artifact_write`, `NON_BYPASS_POSTFLIGHT_CHECK`, а также стабильный `inputHashSeed`;
- orchestration-path использует этот модуль перед финальным `STATE_COMMITTED`, что устраняет inline-конструирование postflight-policy payload и снижает риск bypass/дрейфа.

Это выравнивает preflight/postflight архитектурный паттерн и повышает maintainability без изменения публичных контрактов.


### 3.2.14 Canonical idempotency key builder for run actions

Усилен доменный builder idempotency key:
- `buildIdempotencyKey(...)` поддерживает canonical serialization для object/array payload, что исключает hash drift из-за порядка ключей;
- добавлена явная валидация key-part полей (`tenantId/projectId/runId/taskId/stage/sideEffectType`) и запрет `:` внутри сегментов формата;
- `attempt` валидируется как целое `>= 0`, чтобы убрать неявные ключи для некорректных retry-сценариев.

Это повышает детерминизм dedup suppression и уменьшает риск коллизий/неконсистентности ключей между retry/replay попытками.

### 3.2.9 Unified tool contracts and normalized error envelope

Добавлен унифицированный контракт исполнения инструментов для orchestration path:
- `ToolSet.execute` теперь возвращает typed result envelope (`ok`, `toolName`, `determinism`, `output|error`) вместо неструктурированного значения/исключения;
- для ошибок введён `ToolErrorEnvelope` с обязательными полями `category`, `retriable`, `code`, `message`, `details`;
- добавлена нормализация ошибок адаптеров в единый формат (`normalizeToolError`), чтобы исключить leakage raw provider errors в orchestration layer;
- в descriptor-информацию инструмента добавлены metadata-поля `deterministic` и `sideEffectRisk`, чтобы поддерживать deterministic-first диагностику и риск-классификацию на runtime.

В execution-слое (`Orchestrator.executeTool`) нормализованные ошибки теперь переводятся в структурированный `WorkflowPolicyError` с явным retry сигналом и контекстом категории/кода инструмента, что улучшает diagnosability и безопасность retry решений.



### 3.2.9 Approval routing and SLA escalation hooks

Добавлен production-ready baseline для approval routing/SLA на уровне application-слоя:

- `ApprovalRoutingService` ( `packages/application/src/approval/routing.ts` ) выполняет deterministic маршрутизацию approval request по `requestedAction` в `approverGroup` и optional `escalationGroup`;
- routing использует явные typed rules без provider-specific leakage и возвращает `usedFallbackRule` для diagnosability нестандартных кейсов;
- `ApprovalSlaEscalationService` ( `packages/application/src/approval/sla-escalation.ts` ) вычисляет SLA-возраст заявок и формирует due-срезы для `reminders` и `escalations`;
- SLA-вычисления поддерживают инъекцию clock (`now`) для детерминированных тестов и безопасного replay в orchestration-flow.

Покрытие тестами включает success-path routing и regression-проверку SLA reminder/escalation классификации.

## 3.3 Worker mode

`apps/worker` запускает непрерывный polling loop:
- регулируемый `pollIntervalMs`;
- exponential idle backoff;
- exponential error backoff;
- cycle timeout;
- обработка `SIGINT`/`SIGTERM` (graceful stop).

## 3.4 Dashboard API

NestJS API предоставляет:
- чтение state summary, milestones, backlog;
- экспорт backlog;
- историю событий, failures, decisions, artifacts;
- latest run summary;
- production readiness scorecard (`GET /api/readiness/scorecard`) с измеримыми go/no-go критериями;
  - policy profile может задаваться через runtime config (`workflow.readinessScorecardPolicy`) или env `WORKFLOW_READINESS_SCORECARD_POLICY`;
  - audit trail поддерживает correlation/run context (`correlationId`, `runId`) для агрегирования трендов по релизным окнам;
- approvals (list + approve/reject/resume);
- audit endpoints (metrics, traces);
- review bundle по run;
- health endpoints `/health/live` и `/health/ready`.

API защищается через API key и/или JWT. Без настроенной auth-конфигурации сервис не стартует.

---


### 3.2.14 Immutable Approval Request model and persistence port

Добавлен базовый production-ready срез для approval request domain/persistence контракта:
- в `packages/core` введён schema-first immutable контракт `ImmutableApprovalRequest` + `createImmutableApprovalRequest(...)`;
- валидатор контролирует lifecycle-инварианты по статусам (`approved/rejected/resumed/completed`) и обязательные audit-поля для каждого терминального/переходного состояния;
- объект заявки и `metadata` принудительно `Object.freeze(...)`, что устраняет неявные мутации в runtime flow;
- в `packages/state` выделен persistence port `ApprovalStore` (`append/getById/listByRunId`) для явной границы между domain-моделью approval и адаптерами хранения.

Это делает approval request поток более детерминированным, типобезопасным и удобным для последующей интеграции SLA/routing/task-linking этапов без breaking изменений публичных контрактов.



### 3.2.15 Approval decision linking to policy decisions and run evidence

Добавлена явная связка approval outcome с policy/evidence контекстом на application-контракте:
- `ApprovalRequest` расширен optional-полями `decisionPolicyDecisionId` и `decisionEvidenceId`;
- `ApprovalGateService` (`approve/reject/resume`) теперь принимает optional links (`policyDecisionId`, `evidenceId`) и сохраняет их в approval-модели;
- события `APPROVAL_APPROVED|APPROVAL_REJECTED|APPROVAL_RESUMED` публикуют те же link-поля в payload для корреляции audit trail с execution evidence.

Это снижает риск потери трассировки между manual approval outcome и governance/evidence слоями при incident-forensics и runtime replay.

### 3.2.4 Strongly consistent dedup registry port

Для state-layer добавлен typed порт `DedupRegistryPort` и in-memory адаптер `InMemoryDedupRegistryPort` с явными результатами операций:
- `reserve()` возвращает детерминированные причины отказа (`duplicate_pending|duplicate_succeeded`);
- `finalize()` поддерживает lease ownership check (`lease_owner_mismatch`) и не допускает подтверждение чужого lease;
- прикладной слой использует `DedupRegistryService` как тонкий use-case фасад над портом, сохраняя boundary между application и state.

Это делает dedup-контракт более строгим и диагностируемым для retry/replay и partial-failure сценариев.


## 4. Как пользоваться

## 4.1 Требования

- Node.js (совместимый с текущим toolchain TS/NestJS).
- pnpm (единственный поддерживаемый package manager).
- Доступ к PostgreSQL (если выбран `state.backend=postgresql`).
- Опционально: `gh` CLI для draft PR lifecycle, если используете соответствующие execution-фичи.

## 4.2 Установка

```bash
pnpm install
```

## 4.3 Базовые команды

```bash
pnpm run bootstrap
pnpm run show-state
pnpm run run-cycle
pnpm run run-task -- --task-id TASK-001
pnpm run export-backlog -- --format md --out artifacts/backlog.md
pnpm run generate-docs -- --out artifacts/generated-docs.md
pnpm run assess-release
pnpm run check-state
```

## 4.4 Запуск worker

```bash
pnpm run worker:start -- \
  --poll-interval-ms 250 \
  --idle-backoff-ms 2000 \
  --max-idle-backoff-ms 15000 \
  --cycle-timeout-ms 120000 \
  --error-backoff-ms 1000 \
  --max-error-backoff-ms 30000
```

## 4.5 Запуск Dashboard API

```bash
pnpm run dashboard-api:start
```

Пример минимальной auth-конфигурации через API key:

```bash
export DASHBOARD_API_KEYS="ops:super-secret@admin|operator"
export DASHBOARD_API_HOST="127.0.0.1"
export DASHBOARD_API_PORT="3100"
pnpm run dashboard-api:start
```

---

## 5. Runtime configuration

Конфигурация читается из env + опционального JSON-файла (`RUNTIME_CONFIG_FILE`) и валидируется через `zod`.

### 5.1 Основные группы параметров

- `llm.*` — provider/model/timeout/temperature/budget/cost controls.
- `state.*` — backend (`memory|postgresql`), DSN, schema, snapshot flags.
- `workflow.*` — step/retry limits, `maxRoleWallTimeMs` budget для action loop, workerCount, run lock provider/DSN, workspace mode, approval policy.
- `tools.*` — write-path и shell-allowlist policy, protected paths, evidence persistence.
- `logging.*` — уровень и формат логирования.

### 5.2 Ключевые защитные инварианты конфигурации

- Ограничены максимальные `maxStepsPerRun`, `maxRetriesPerTask`, `maxRoleStepsPerTask`.
- Для multi-worker запрещён `runLockProvider=noop` и обязателен shared `runLockDsn`.
- Валидация схемы `runLockDsn` зависит от lock-провайдера (postgres/redis/etcd).
- Для PostgreSQL state backend обязательна корректная postgres-схема URL и имя БД.
- Проверяется writable policy для configured write paths.

---

## 6. Наблюдаемость и эксплуатация

- Structured logging через shared logger.
- Секреты редактируются (redaction) в runtime-config/logging pipeline.
- Dashboard API имеет liveness/readiness probes.
- Orchestrator пишет run-step log и telemetry-метрики/трейсоподобные записи.
- Для run-step log включена integrity-проверка цепочки на read-path (`listRunSteps` по `runId`) и сигнализация `EVIDENCE_INTEGRITY_VIOLATION`.
- Есть механизмы failure handling: dead-letter, resume, replay checkpoint.

---

## 7. Проверка качества и CI-ориентированная валидация

В репозитории используется Turbo pipeline:

```bash
pnpm turbo run lint
pnpm turbo run test
pnpm turbo run typecheck
pnpm turbo run build
```

Также доступны скрипты через pnpm:

```bash
pnpm run lint
pnpm run test
pnpm run typecheck
pnpm run build
```

---

## 8. Типовой операционный сценарий

1. Настроить env/runtime config.
2. Выполнить `pnpm run bootstrap`.
3. Проверить состояние `pnpm run show-state`.
4. Запускать `run-cycle` вручную или поднять `worker:start`.
5. Наблюдать систему через Dashboard API.
6. При сбоях использовать `resume-failure`/`replay-failure`.
7. Экспортировать backlog/артефакты для интеграций и ревью.

---

## 9. Ограничения версии 1.0.0

- Это инфраструктурная оркестрационная платформа, а не конечный UI-продукт.
- Полнота реальной автономности зависит от настроек ролей, инструментов и окружения.
- Некоторые сценарии (git push / draft PR / внешние интеграции) требуют внешних CLI и прав в среде выполнения.

---

## 10. Краткое резюме

Проект реализует **ядро AI-оркестратора** для инженерных workflow: от bootstrap и анализа до исполнения задач, quality gates, approvals, наблюдаемости и API-доступа к состоянию. Использовать его можно как через CLI (control plane), так и как фоновый worker + dashboard API в production-подобной инфраструктуре.


### 3.2.15 Bounded Retry Policy module (backoff + jitter)

Добавлен отдельный retry-policy слой для execution runtime:
- в `packages/core` введён typed модуль `retry-policy` с валидацией параметров (`maxAttempts`, `baseDelayMs`, `maxDelayMs`, `backoffMultiplier`, `jitterRatio`);
- расчет retry schedule выполняется детерминированно и bounded: exponential backoff ограничивается `maxDelayMs`, jitter применяется в контролируемом диапазоне `± jitterRatio`;
- в `packages/execution` добавлен `executeWithRetry(...)`, который централизует retry-loop, bounded delays и отмену через `AbortSignal`;
- non-retriable ошибки завершают цикл немедленно, retriable — повторяются только в пределах policy-лимита.

Это формирует переиспользуемый production-ready базис для безопасных retry решений без дублирования backoff-логики по execution-коду.

### 3.2.7 Strict tool input/output schemas for adapters

В `packages/tools` введена обязательная контрактная schema-валидация на unified runtime boundary:
- перед dispatch в adapter выполняется `validateToolInput(...)`;
- после выполнения adapter выполняется `validateToolOutput(...)`;
- нарушения схем возвращаются как структурированные ошибки `TOOL_INPUT_SCHEMA_INVALID` / `TOOL_OUTPUT_SCHEMA_INVALID` с категорией `validation` и `retriable=false`.

Покрыты tool-контракты для:
`file_read`, `file_write`, `file_list`, `file_exists`, `git_status`, `git_diff`, `git_current_branch`, `typescript_check`, `typescript_diagnostics`, `shell_exec`, `testing_run`, `diff_workspace`, `search_repo`.

Это уменьшает риск дрейфа контрактов между orchestration core и adapters и повышает diagnosability инцидентов на execution boundary.

### 3.2.15 Workspace prepare stage with snapshot creation

Добавлен минимальный production-ready срез для `workspace_prepare` в mutation pipeline:
- выделен `executeWorkspacePrepareStage(...)` с typed-результатом, детерминированным `snapshotId` (`{runId}-{taskId}`) и structured metadata (`snapshotPath`, `snapshotCreatedAt`);
- добавлен tool-layer helper `createWorkspaceSnapshot(...)`, который проверяет существование workspace, создает snapshot-каталог и копию workspace с `AbortSignal`-поддержкой;
- ошибки нормализуются в explicit коды `WORKSPACE_NOT_FOUND`, `SNAPSHOT_CANCELLED`, `SNAPSHOT_FAILED`, что улучшает retry-решения и postmortem-диагностику;
- добавлены unit-тесты для success/failure/regression/cancellation путей, чтобы закрыть базовые execution safety требования для стадии подготовки workspace.


### 3.2.15 change_apply stage with patch diagnostics

Добавлен минимальный production-ready слой применения патча для стадии `change_apply`:
- в tools-слое реализован `applyPatch(...)` с использованием `git apply --recount --index --verbose` и структурированными диагностическими полями (`changedFiles`, `stdout`, `stderr`, `command`);
- введен typed error-contract `ApplyPatchError` с кодами `PATCH_TEXT_EMPTY`, `PATCH_APPLY_FAILED`, `PATCH_CANCELLED`;
- в execution-слое стадия `executeChangeApplyStage(...)` маппит tool-ошибки в детерминированные stage failure outcomes с явной retry-семантикой (empty/cancelled => non-retriable, apply_failed => retriable);
- это повышает diagnosability мутаций и снижает риск неявного падения change_apply без полезного контекста для postmortem.



### 3.2.15 Mutation verification gates (build/lint/typecheck/test/security)

Для `RepoMutationPipeline` добавлен минимальный verification-slice production-ready уровня:
- stage `verification` реализован через `executeVerificationStage(...)` с typed результатом и явными кодами ошибок;
- verification suite выполняет фиксированные gates: `build -> lint -> typecheck -> test -> security` последовательно и fail-fast;
- по каждой gate собирается evidence (`startedAt`, `finishedAt`, `durationMs`, `exitCode`, `output`) для postmortem;
- stage формирует агрегированные metadata (`executedGates`, `executedGateCount`, `totalDurationMs`, `failedGate`) и разделяет: 
  - бизнес-failure gate (`VERIFICATION_GATE_FAILED`, non-retriable),
  - runtime-исключения раннера (`VERIFICATION_STAGE_FAILED`, retriable).

Это делает verification-контур явным contract-level этапом mutation pipeline и улучшает diagnosability без breaking изменений существующих API.


### 3.2.15 Commit/push prepare stages with explicit compensation

Для `RepoMutationPipeline` реализованы отдельные стадии `commit_prepare` и `push_prepare` с явными typed-контрактами и компенсацией:
- `commit_prepare` создаёт commit и возвращает metadata (`commitSha`), на ошибке выдаёт structured failure `COMMIT_PREPARE_FAILED`;
- компенсация commit-стадии выполняет `git reset --hard HEAD~1` через отдельный `resetHardHead` executor;
- `push_prepare` требует `branchName`, выполняет push и возвращает metadata (`branchName`, `remoteRef`), на ошибке выдаёт `PUSH_PREPARE_FAILED`;
- при отсутствии `branchName` возвращается deterministic non-retriable ошибка `PUSH_PREPARE_BRANCH_REQUIRED`;
- компенсация push-стадии удаляет удалённую ветку через `pushDelete`, что снижает риск partial-success при падении downstream-стадий.

Изменение additively расширяет stage coverage без изменения публичных runtime контрактов pipeline.


### 3.2.16 Queue lease/heartbeat worker ownership protocol

Добавлен минимальный production-ready контракт владения задачей очереди между worker-инстансами:
- в `packages/state` введен typed `QueueLeaseStore` и in-memory реализация `InMemoryQueueLeaseStore` с операциями `acquire/heartbeat/release`;
- lease хранит `jobId`, `ownerId`, `leaseId`, `acquiredAtIso`, `heartbeatAtIso`, `expiresAtIso`;
- повторный `acquire` для активного lease детерминированно отклоняется с `already_leased`;
- `heartbeat/release` валидируют owner+lease token и возвращают структурированные причины `missing_lease|lease_owner_mismatch`;
- в execution-слой добавлен `QueueLeaseManager`, который оборачивает store-контракт, добавляет telemetry-friendly logging и выдает `QueueLeaseHandle` для worker-потока.

Это закрывает минимальный ownership-протокол для Phase 4 queue/worker separation и снижает риск конкурентной обработки одной job несколькими worker-процессами.
