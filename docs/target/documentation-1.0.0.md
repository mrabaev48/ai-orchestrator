# AI Orchestrator — Documentation 1.0.0

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
- `workflow.*` — step/retry limits, workerCount, run lock provider/DSN, workspace mode, approval policy.
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
turbo run lint
turbo run test
turbo run typecheck
turbo run build
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
