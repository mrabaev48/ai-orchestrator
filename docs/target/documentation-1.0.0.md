# AI Orchestrator — Documentation 1.12.1

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

## 3.2 Orchestrator runtime

Execution-слой включает:
- bounded retries/step limits;
- timeout/cancellation через `AbortSignal`;
- telemetry counters/histograms;
- structured error propagation;
- append-only run-step logging с checksum-chain;
- workflow policy guards;
- git lifecycle automation (branch/commit/push/pr-draft) с approval gating.

### 3.2.1 Run-step evidence integrity

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

Suite запускается через `npm run test:baseline-invariants`; в turbo-пайплайне добавлена задача `baseline-invariants`, и `build` теперь зависит от нее (blocking gate).

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

## 4. Как пользоваться

## 4.1 Требования

- Node.js (совместимый с текущим toolchain TS/NestJS).
- npm (в репозитории есть `package-lock.json`).
- Доступ к PostgreSQL (если выбран `state.backend=postgresql`).
- Опционально: `gh` CLI для draft PR lifecycle, если используете соответствующие execution-фичи.

## 4.2 Установка

```bash
npm install
```

## 4.3 Базовые команды

```bash
npm run bootstrap
npm run show-state
npm run run-cycle
npm run run-task -- --task-id TASK-001
npm run export-backlog -- --format md --out artifacts/backlog.md
npm run generate-docs -- --out artifacts/generated-docs.md
npm run assess-release
npm run check-state
```

## 4.4 Запуск worker

```bash
npm run worker:start -- \
  --poll-interval-ms 250 \
  --idle-backoff-ms 2000 \
  --max-idle-backoff-ms 15000 \
  --cycle-timeout-ms 120000 \
  --error-backoff-ms 1000 \
  --max-error-backoff-ms 30000
```

## 4.5 Запуск Dashboard API

```bash
npm run dashboard-api:start
```

Пример минимальной auth-конфигурации через API key:

```bash
export DASHBOARD_API_KEYS="ops:super-secret@admin|operator"
export DASHBOARD_API_HOST="127.0.0.1"
export DASHBOARD_API_PORT="3100"
npm run dashboard-api:start
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

Также доступны npm-скрипты:

```bash
npm run lint
npm run test
npm run typecheck
npm run build
```

---

## 8. Типовой операционный сценарий

1. Настроить env/runtime config.
2. Выполнить `npm run bootstrap`.
3. Проверить состояние `npm run show-state`.
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
