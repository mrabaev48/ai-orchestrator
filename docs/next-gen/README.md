# next-gen — план работ в тасках

Разбиение [`next-dev.md`](../../next-dev.md) и [`tech.md`](../../tech.md) на исполняемые задачи.

## Как читать

- **Номер группы** = порядок выполнения групп. **Номер таска** = порядок внутри группы
  (первые две цифры — группа). Зависимости указаны явно в каждом файле и всегда ссылаются
  назад по номеру — обратных зависимостей нет.
- Каждый таск содержит: контекст со ссылками на реальный код, задачу, объём, контракт (где нужен),
  использованную документацию, критерии приёмки, тесты и явное «не входит».
- **Оценки:** `S` ≤ 1 дня · `M` 1–3 дня · `L` 3–5 дней · `XL` > 5 дней.
- Ворота качества для любого таска: `pnpm run check` (границы пакетов, lint, typecheck, тесты)
  плюс `tests/baseline-invariants-regression.test.ts`.

## Фазы

| Фаза | Группы | Результат фазы |
|---|---|---|
| **P0** — фундамент | 01–07 | Один инстанс ведёт несколько проектов; модели (включая локальные) подключаются как данные; стоимость считается по факту |
| **P1** — параллелизм | 08–11 | Очередь, пул воркеров, ресурсные блокировки, параллельные задачи |
| **P2** — расширяемость | 12–18 | Реестр инструментов, диалоговый цикл, сборка контекста, MCP, агенты как данные, skills, rules |
| **P3** — продукт | 19–23 | Write-API, реалтайм, git-хостинг и триггеры, наблюдаемость, веб-интерфейс |
| **P4** — зрелость | 24–27 | Чистка легаси, evals и replay, песочница и egress, память и индекс |

## Контрольные точки

| После группы | Проверка |
|---|---|
| 07 | `0706` — два проекта, два провайдера (один локальный), изолированные прогоны |
| 11 | `1007`, `1008` — 20 одновременных прогонов; убийство воркера без дублей side-effect |
| 18 | `1610` — паритет декларативных агентов; `1510` — MCP на фикстурном сервере |
| 23 | Полный путь «подключил репозиторий → собрал агентов → получил PR» без CLI |

## Соответствие требованиям

| Требование | Группы |
|---|---|
| Агенты параллельно работают над разными проектами | 01, 02, 07, 08, 09, 10, 11 |
| Несколько LLM разных провайдеров одновременно | 03, 04, 05, 06 |
| Локальные LLM (Ollama, vLLM, LM Studio, llama.cpp, TGI) | 04 (`0402`, `0403`), 26 (`2604`) |
| Добавление / изменение / удаление агентов | 16, 19 (`1907`), 23 (`2306`) |
| Подключение MCP | 12, 15 |
| Skills | 17 |
| Rules | 18 |
| Прочие полезные фичи | 13, 14, 20, 21, 22, 23, 25, 26, 27 |

## Использованная документация

При составлении тасков сверялись с актуальной документацией ресурсов, которые затрагиваются:

| Ресурс | Что взято | Где использовано |
|---|---|---|
| MCP TypeScript SDK (установлен 1.29.0) | `Client`, `StdioClientTransport`, `StreamableHTTPClientTransport`, `listTools` с пагинацией, `callTool`, обязательный `close()` | 1503, 1504, 1505, 1506 |
| Ollama API | `/api/chat` (`tools`, `format` с JSON Schema, `options`, `keep_alive`), ответ `message.tool_calls`, `done_reason`, `prompt_eval_count`, `eval_count`; `/api/tags`, `/api/show` | 0403 |
| vLLM structured outputs | `response_format` с `json_schema`; `extra_body.structured_outputs` (`json`, `grammar`, `choice`, `regex`); `guided_*` удалены в 0.12 | 0402, 0307 |
| OpenAI Structured Outputs | Responses `text.format = {type:'json_schema', name, schema, strict}`; требования strict-схемы (все поля в `required`, `additionalProperties:false`); `refusal`; `usage` | 0301, 0307, 0401, 1205 |
| Anthropic Messages | `tools[].input_schema`, `tool_use` / `tool_result` (`is_error`), `stop_reason`, `tool_choice`; prompt caching: `cache_control` (`ephemeral`, `ttl:'1h'`), ≤4 брейкпоинта, `cache_creation_input_tokens` / `cache_read_input_tokens`, инвалидация при смене инструментов | 0301, 0404, 1305 |
| NestJS | `@Sse`, `Observable<MessageEvent>`, поля `data` / `id` / `type` / `retry` | 2002 |
| OpenTelemetry JS | `@opentelemetry/sdk-node`, OTLP-экспортёры traces/metrics, `PeriodicExportingMetricReader` | 2201 |
| PostgreSQL | `FOR UPDATE SKIP LOCKED` для очереди | 0803 |
| zod (установлен 4.4.3) | `z.toJSONSchema()` для генерации схем инструментов и выходов агентов | 1205, 1602 |

## Полный список задач

### 01 · foundation-contracts

- [0101 — Доменные типы Tenant / Project / Repository](01-foundation-contracts/0101-tenant-project-repository-types.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: —</sub>
- [0102 — Контракт ProjectConfig и правила наследования](01-foundation-contracts/0102-project-config-contract.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0101</sub>
- [0103 — Инвариант «дочерняя политика только сужает»](01-foundation-contracts/0103-policy-narrowing-invariant.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0102</sub>
- [0104 — Контракт RunContext](01-foundation-contracts/0104-run-context-contract.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0101, 0102</sub>
- [0105 — Порт ScopedStateStore](01-foundation-contracts/0105-scoped-state-store-port.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0101</sub>
- [0106 — Адаптер bindScope: ScopedStateStore → StateStore](01-foundation-contracts/0106-bindscope-legacy-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0105</sub>
- [0107 — Разделение RuntimeConfig на InstanceConfig и ProjectConfig](01-foundation-contracts/0107-split-instance-and-project-config.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0102</sub>

### 02 · state-scoping-and-journals

- [0201 — Миграция v9: таблицы tenants / projects / repositories / project_configs](02-state-scoping-and-journals/0201-migration-v9-catalog-tables.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0101, 0102</sub>
- [0202 — Репозиторий каталога проектов (Postgres + in-memory)](02-state-scoping-and-journals/0202-project-catalog-repository.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0201</sub>
- [0203 — Миграция v10: скоуп-колонки и индексы в журналах](02-state-scoping-and-journals/0203-migration-v10-scope-columns.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0201</sub>
- [0204 — Скоупированный PostgresStateStore](02-state-scoping-and-journals/0204-scoped-postgres-state-store.md)  <br/>  <sub>Фаза: P0 · Оценка: L · Зависит от: 0105, 0203</sub>
- [0205 — Скоупированный InMemoryStateStore](02-state-scoping-and-journals/0205-scoped-in-memory-state-store.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0105</sub>
- [0206 — Двойная запись журналов (снимок + таблицы)](02-state-scoping-and-journals/0206-dual-write-journals.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0204, 0205</sub>
- [0207 — Перевод читателей на журнальные таблицы](02-state-scoping-and-journals/0207-switch-read-path-to-journals.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0206</sub>
- [0208 — Проверка целостности состояния в скоупированном мире](02-state-scoping-and-journals/0208-state-integrity-for-scoped-store.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0207</sub>

### 03 · llm-gateway-core

- [0301 — Контракты чата: сообщения, инструменты, usage](03-llm-gateway-core/0301-chat-contracts.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: —</sub>
- [0302 — ProviderRegistration и ModelDescriptor](03-llm-gateway-core/0302-provider-and-model-descriptors.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0301</sub>
- [0303 — Таксономия ошибок LLM и нормализация](03-llm-gateway-core/0303-error-taxonomy.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0301</sub>
- [0304 — Порт ModelProviderAdapter и реестр провайдеров](03-llm-gateway-core/0304-adapter-port-and-registry.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0302, 0303</sub>
- [0305 — HTTP-транспорт: таймауты, ретраи, джиттер](03-llm-gateway-core/0305-http-transport-retry.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0303</sub>
- [0306 — Circuit breaker на провайдера](03-llm-gateway-core/0306-circuit-breaker.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0305</sub>
- [0307 — Стратегии structured output и их деградация](03-llm-gateway-core/0307-structured-output-strategies.md)  <br/>  <sub>Фаза: P0 · Оценка: L · Зависит от: 0302</sub>
- [0308 — Repair-проход при невалидном JSON](03-llm-gateway-core/0308-schema-repair-pass.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0307</sub>
- [0309 — Совместимость: LlmClient поверх Gateway](03-llm-gateway-core/0309-legacy-llmclient-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0304, 0307</sub>
- [0310 — Кассеты запись/воспроизведение ответов LLM](03-llm-gateway-core/0310-llm-cassettes.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304</sub>

### 04 · llm-providers

- [0401 — Адаптер OpenAI Responses](04-llm-providers/0401-openai-responses-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304, 0307</sub>
- [0402 — Универсальный адаптер OpenAI-compatible (vLLM, LM Studio, llama.cpp, OpenRouter)](04-llm-providers/0402-openai-compatible-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304, 0307</sub>
- [0403 — Нативный адаптер Ollama](04-llm-providers/0403-ollama-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304, 0307</sub>
- [0404 — Адаптер Anthropic Messages (tool use + prompt caching)](04-llm-providers/0404-anthropic-adapter.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304, 0307</sub>
- [0405 — Health-check и дискавери моделей](04-llm-providers/0405-health-and-model-discovery.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0401, 0402, 0403, 0404</sub>
- [0406 — Ограничитель конкурентности на провайдера](04-llm-providers/0406-provider-concurrency-limiter.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0304</sub>
- [0407 — Mock-провайдер и общий набор фикстур](04-llm-providers/0407-mock-provider-and-fixtures.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0304</sub>
- [0408 — Дополнительные облачные адаптеры (Google, Azure OpenAI, Bedrock)](04-llm-providers/0408-additional-cloud-adapters.md)  <br/>  <sub>Фаза: P0/опционально · Оценка: L · Зависит от: 0401, 0402</sub>

### 05 · credentials-and-catalog

- [0501 — Порт CredentialStore](05-credentials-and-catalog/0501-credential-store-port.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0302</sub>
- [0502 — Миграция v11: providers / models / credentials](05-credentials-and-catalog/0502-migration-v11-provider-tables.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0201, 0501</sub>
- [0503 — Шифрованное хранилище кредов (AES-256-GCM)](05-credentials-and-catalog/0503-encrypted-credential-store.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0501, 0502</sub>
- [0504 — Расширение редакции секретов на провайдеров](05-credentials-and-catalog/0504-secret-redaction-coverage.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0503</sub>
- [0505 — Сервис каталога провайдеров и моделей](05-credentials-and-catalog/0505-provider-catalog-service.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0304, 0405, 0502</sub>

### 06 · model-routing-and-cost

- [0601 — Контракт политики маршрутизации моделей](06-model-routing-and-cost/0601-routing-policy-contract.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0302</sub>
- [0602 — Резолвер маршрутизации с ограничениями и здоровьем](06-model-routing-and-cost/0602-routing-resolver.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0601, 0405</sub>
- [0603 — Исполнитель цепочки fallback](06-model-routing-and-cost/0603-fallback-chain.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0602, 0305, 0306</sub>
- [0604 — Реальный выбор модели по роли/агенту](06-model-routing-and-cost/0604-wire-real-role-model-selection.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0602, 0309</sub>
- [0605 — Учёт токенов по фактическому usage](06-model-routing-and-cost/0605-usage-based-accounting.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0301, 0604</sub>
- [0606 — Таблица run_cost и рекордер стоимости](06-model-routing-and-cost/0606-run-cost-table.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0605, 0502</sub>
- [0607 — Принудительные бюджеты на фактической стоимости](06-model-routing-and-cost/0607-budget-enforcement.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0606, 0102</sub>
- [0608 — Метрики стоимости и выбора модели](06-model-routing-and-cost/0608-cost-and-model-metrics.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0605, 0606</sub>

### 07 · multiproject-runtime

- [0701 — Фабрика рантайма на проект](07-multiproject-runtime/0701-runtime-factory-per-project.md)  <br/>  <sub>Фаза: P0 · Оценка: L · Зависит от: 0104, 0106, 0202, 0505</sub>
- [0702 — Сервис жизненного цикла проекта](07-multiproject-runtime/0702-project-lifecycle-service.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0202, 0701</sub>
- [0703 — CLI-команды для проектов](07-multiproject-runtime/0703-cli-project-commands.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0702</sub>
- [0704 — CLI-команды для провайдеров моделей](07-multiproject-runtime/0704-cli-provider-commands.md)  <br/>  <sub>Фаза: P0 · Оценка: S · Зависит от: 0505</sub>
- [0705 — Bootstrap в мультипроектном режиме](07-multiproject-runtime/0705-bootstrap-per-project.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0701, 0703</sub>
- [0706 — E2E: два проекта, два провайдера (в т.ч. локальный)](07-multiproject-runtime/0706-two-projects-e2e.md)  <br/>  <sub>Фаза: P0 · Оценка: M · Зависит от: 0604, 0701, 0705</sub>

### 08 · run-queue

- [0801 — Миграция v12: таблица run_queue](08-run-queue/0801-migration-v12-run-queue.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0203</sub>
- [0802 — Порт и контракты очереди прогонов](08-run-queue/0802-queue-port-contracts.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0801</sub>
- [0803 — Postgres-реализация очереди (FOR UPDATE SKIP LOCKED)](08-run-queue/0803-postgres-queue-skip-locked.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0802</sub>
- [0804 — Идемпотентность постановки в очередь](08-run-queue/0804-queue-idempotency.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0803</sub>
- [0805 — Reaper просроченных лиз очереди](08-run-queue/0805-queue-lease-reaper.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0803</sub>
- [0806 — Интеграция очереди с dead-letter и replay](08-run-queue/0806-dead-letter-integration.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0805</sub>
- [0807 — Метрики очереди](08-run-queue/0807-queue-metrics.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0803</sub>

### 09 · resource-locks

- [0901 — Модель ресурсных ключей](09-resource-locks/0901-resource-key-model.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0101</sub>
- [0902 — Планировщик заявок на ресурсы](09-resource-locks/0902-resource-claim-planner.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0901</sub>
- [0903 — Упорядоченный захват нескольких ресурсов](09-resource-locks/0903-ordered-multi-resource-acquisition.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0902</sub>
- [0904 — Замена глобальной блокировки прогона](09-resource-locks/0904-replace-global-run-lock.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0903</sub>
- [0905 — Режимы shared / exclusive в lock-store](09-resource-locks/0905-shared-and-exclusive-modes.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0903</sub>
- [0906 — Property-тесты на отсутствие взаимных блокировок](09-resource-locks/0906-lock-property-tests.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0904, 0905</sub>

### 10 · scheduler-and-worker-pool

- [1001 — Контракт политики планировщика](10-scheduler-and-worker-pool/1001-scheduler-policy-contract.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 0802</sub>
- [1002 — Справедливое распределение между проектами](10-scheduler-and-worker-pool/1002-fair-share-selection.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1001, 0803</sub>
- [1003 — Backpressure и фиксация причин отказа](10-scheduler-and-worker-pool/1003-backpressure-and-block-reasons.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1001, 0607, 0702</sub>
- [1004 — Пул воркеров вместо одиночного цикла](10-scheduler-and-worker-pool/1004-worker-pool-runtime.md)  <br/>  <sub>Фаза: P1 · Оценка: L · Зависит от: 0803, 1002, 1003</sub>
- [1005 — Мягкое завершение и дренаж](10-scheduler-and-worker-pool/1005-graceful-shutdown.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1004</sub>
- [1006 — Переключатель режима воркера poll/queue](10-scheduler-and-worker-pool/1006-worker-mode-switch.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 1004</sub>
- [1007 — Нагрузочный профиль параллельного исполнения](10-scheduler-and-worker-pool/1007-concurrency-load-test.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1004, 0904</sub>
- [1008 — Chaos: убийство воркера в середине мутации](10-scheduler-and-worker-pool/1008-chaos-worker-kill.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1005, 0806</sub>

### 11 · parallel-tasks

- [1101 — Детектор конфликтов между задачами](11-parallel-tasks/1101-task-conflict-detection.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0904</sub>
- [1102 — Выбор набора параллельных задач](11-parallel-tasks/1102-parallel-task-selection.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1101</sub>
- [1103 — Своя ветка и worktree на задачу](11-parallel-tasks/1103-per-task-branch-and-worktree.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1102, 0904</sub>
- [1104 — Merge queue для параллельных задач](11-parallel-tasks/1104-merge-queue-service.md)  <br/>  <sub>Фаза: P1 · Оценка: L · Зависит от: 1103</sub>
- [1105 — Ребейз и повторная верификация](11-parallel-tasks/1105-rebase-and-reverify.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1104</sub>
- [1106 — Политика эскалации конфликтов](11-parallel-tasks/1106-conflict-escalation.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 1105</sub>

### 12 · tool-registry

- [1201 — Открытие закрытого union ToolCallName](12-tool-registry/1201-open-toolcallname-union.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: —</sub>
- [1202 — ToolDescriptor и реестр инструментов](12-tool-registry/1202-tool-descriptor-and-registry.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1201</sub>
- [1203 — Регистрация локальных адаптеров в реестре](12-tool-registry/1203-local-adapters-registration.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1202</sub>
- [1204 — Привязка класса риска к гейтам](12-tool-registry/1204-risk-class-binding.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1202</sub>
- [1205 — Экспорт схем инструментов в формат модели](12-tool-registry/1205-tool-schema-exposure.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1202</sub>

### 13 · messages-action-loop

- [1301 — RoleGenerationPort v2 на сообщениях](13-messages-action-loop/1301-role-generation-port-v2.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 0301, 0604</sub>
- [1302 — Мост к нативному tool-calling](13-messages-action-loop/1302-native-tool-calling-bridge.md)  <br/>  <sub>Фаза: P1 · Оценка: L · Зависит от: 1301, 1205</sub>
- [1303 — Наблюдения как сообщения роли tool](13-messages-action-loop/1303-observation-as-tool-message.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1302</sub>
- [1304 — Сжатие старых наблюдений](13-messages-action-loop/1304-observation-compression.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1303</sub>
- [1305 — Подсказки кэширования промпта](13-messages-action-loop/1305-prompt-cache-hints.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1303, 0404</sub>
- [1306 — Перевод ProductionCoderRole на сообщения](13-messages-action-loop/1306-migrate-production-coder.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1302, 1304</sub>
- [1307 — Перевод ProductionReviewerRole на сообщения](13-messages-action-loop/1307-migrate-production-reviewer.md)  <br/>  <sub>Фаза: P1 · Оценка: S · Зависит от: 1306</sub>
- [1308 — Паритет бюджетов и отмены после миграции цикла](13-messages-action-loop/1308-loop-budget-parity-tests.md)  <br/>  <sub>Фаза: P1 · Оценка: M · Зависит от: 1306, 1307</sub>

### 14 · context-assembler

- [1401 — Модель бюджета контекста](14-context-assembler/1401-context-budget-model.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 0302</sub>
- [1402 — Пайплайн сборки контекста](14-context-assembler/1402-assembler-pipeline.md)  <br/>  <sub>Фаза: P2 · Оценка: L · Зависит от: 1401</sub>
- [1403 — Приоритеты вытеснения при нехватке бюджета](14-context-assembler/1403-eviction-priorities.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1402, 1304</sub>
- [1404 — Сводка состояния v2 с бюджетом](14-context-assembler/1404-state-summary-v2.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1401</sub>
- [1405 — Тестовый набор сборщика контекста](14-context-assembler/1405-assembler-tests.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1402, 1403</sub>

### 15 · mcp-integration

- [1501 — Контракт регистрации MCP-сервера](15-mcp-integration/1501-mcp-registration-contract.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1202</sub>
- [1502 — Миграция v14: mcp_servers / skills / rules / bindings](15-mcp-integration/1502-migration-v14-capabilities.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 0201</sub>
- [1503 — MCP-клиент: транспорт stdio](15-mcp-integration/1503-mcp-client-stdio.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1501</sub>
- [1504 — MCP-клиент: транспорт streamable HTTP](15-mcp-integration/1504-mcp-client-http.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1501</sub>
- [1505 — Пул соединений и жизненный цикл MCP](15-mcp-integration/1505-mcp-connection-pool.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1503, 1504</sub>
- [1506 — Обнаружение инструментов и неймспейсинг](15-mcp-integration/1506-mcp-discovery-and-namespacing.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1505, 1202</sub>
- [1507 — Адаптер вызова MCP-инструмента в реестре](15-mcp-integration/1507-mcp-tool-adapter.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1506</sub>
- [1508 — Классы риска и approvals для MCP-инструментов](15-mcp-integration/1508-mcp-risk-defaults-and-approval.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1507, 1204</sub>
- [1509 — Изоляция недоверенного вывода MCP](15-mcp-integration/1509-mcp-untrusted-output-isolation.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1507, 1402</sub>
- [1510 — Фикстурный MCP-сервер и тестовый набор](15-mcp-integration/1510-mcp-fixture-server-and-tests.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1503, 1504</sub>

### 16 · agent-definitions

- [1601 — Открытие AgentRoleName → RoleKey](16-agent-definitions/1601-open-rolekey-union.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: —</sub>
- [1602 — Схема AgentDefinition](16-agent-definitions/1602-agent-definition-schema.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1601, 0103</sub>
- [1603 — Миграция v13: agent_versions / agent_assignments](16-agent-definitions/1603-migration-v13-agent-tables.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 0201</sub>
- [1604 — Репозиторий агентов и версионирование](16-agent-definitions/1604-agent-repository-and-versioning.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1602, 1603</sub>
- [1605 — Проверка неэскалации прав агента](16-agent-definitions/1605-policy-escalation-check.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 0103, 1602</sub>
- [1606 — Пайплайн валидации при публикации агента](16-agent-definitions/1606-agent-validation-pipeline.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1604, 1605</sub>
- [1607 — Обобщённый рантайм декларативного агента](16-agent-definitions/1607-declarative-agent-runtime.md)  <br/>  <sub>Фаза: P2 · Оценка: L · Зависит от: 1302, 1602, 1402</sub>
- [1608 — Компилятор определений и кэш](16-agent-definitions/1608-agent-compiler-and-cache.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1607</sub>
- [1609 — Seed 12 встроенных ролей как определений](16-agent-definitions/1609-seed-builtin-agents.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1604, 1602</sub>
- [1610 — Паритет: TS-роль против декларативной](16-agent-definitions/1610-parity-builtin-vs-declarative.md)  <br/>  <sub>Фаза: P2 · Оценка: L · Зависит от: 1607, 1609</sub>
- [1611 — Песочница dry-run для агента](16-agent-definitions/1611-agent-dry-run-sandbox.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1607, 0310</sub>
- [1612 — agentRef в evidence и в стоимости](16-agent-definitions/1612-agent-ref-in-evidence.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1607, 0606</sub>

### 17 · skills

- [1701 — Модель Skill и хранилище](17-skills/1701-skill-definition-and-store.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1502</sub>
- [1702 — Загрузчик скиллов и lock-файл с чек-суммами](17-skills/1702-skill-loader-and-lock.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1701</sub>
- [1703 — Каталог скиллов и прогрессивное раскрытие](17-skills/1703-progressive-disclosure-catalog.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1701, 1402</sub>
- [1704 — Инструмент skill_load](17-skills/1704-skill-load-tool.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1703, 1202</sub>
- [1705 — Привязка скиллов к агенту и проекту](17-skills/1705-skill-bindings.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1701, 1502</sub>

### 18 · rules

- [1801 — Контракт Rule и скоупы](18-rules/1801-rule-contract-and-scopes.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1502</sub>
- [1802 — Разрешение и приоритеты правил](18-rules/1802-rule-resolution-precedence.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1801</sub>
- [1803 — Инжекция guidance-правил в контекст](18-rules/1803-guidance-injection.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1802, 1402</sub>
- [1804 — Исполнение enforced-предикатов](18-rules/1804-enforced-rule-predicates.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1801</sub>
- [1805 — Встраивание правил в policy engine](18-rules/1805-policy-engine-integration.md)  <br/>  <sub>Фаза: P2 · Оценка: M · Зависит от: 1804</sub>
- [1806 — Фиксация набора правил в evidence](18-rules/1806-rule-set-in-evidence.md)  <br/>  <sub>Фаза: P2 · Оценка: S · Зависит от: 1802, 1612</sub>

### 19 · control-plane-api

- [1901 — Разделение API на read и write модули](19-control-plane-api/1901-api-read-write-split.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 0702</sub>
- [1902 — Аутентификация: API-ключи и JWT-скоупы](19-control-plane-api/1902-api-auth-and-scopes.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 0503</sub>
- [1903 — Вынос RBAC/ABAC в общий модуль](19-control-plane-api/1903-rbac-shared-module.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1902</sub>
- [1904 — Idempotency-Key для мутирующих запросов](19-control-plane-api/1904-idempotency-middleware.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 0804</sub>
- [1905 — Эндпоинты проектов и репозиториев](19-control-plane-api/1905-projects-endpoints.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 0702</sub>
- [1906 — Эндпоинты провайдеров и моделей](19-control-plane-api/1906-providers-endpoints.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 0505</sub>
- [1907 — Эндпоинты агентов](19-control-plane-api/1907-agents-endpoints.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 1604, 1611</sub>
- [1908 — Эндпоинты MCP / skills / rules](19-control-plane-api/1908-capabilities-endpoints.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1901, 1501, 1701, 1801</sub>
- [1909 — Эндпоинты прогонов и approvals](19-control-plane-api/1909-runs-and-approvals-endpoints.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1904, 0802</sub>
- [1910 — OpenAPI-контракт и контрактные тесты](19-control-plane-api/1910-openapi-contract.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1905, 1906, 1907, 1908, 1909</sub>

### 20 · realtime-and-notifications

- [2001 — Шина событий прогона](20-realtime-and-notifications/2001-run-event-bus.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1004</sub>
- [2002 — SSE-поток прогона](20-realtime-and-notifications/2002-sse-stream-endpoint.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2001, 1902</sub>
- [2003 — Исходящие webhooks](20-realtime-and-notifications/2003-webhook-dispatcher.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2001</sub>
- [2004 — Уведомления (Slack / Telegram / email)](20-realtime-and-notifications/2004-notifications.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2001</sub>
- [2005 — Вмешательство человека в идущий прогон](20-realtime-and-notifications/2005-run-interjection.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1909, 1402</sub>

### 21 · git-hosting-and-triggers

- [2101 — Порт git-хостинга](21-git-hosting-and-triggers/2101-git-hosting-port.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 0101</sub>
- [2102 — Адаптер GitHub](21-git-hosting-and-triggers/2102-github-adapter.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2101, 0503</sub>
- [2103 — Адаптер GitLab](21-git-hosting-and-triggers/2103-gitlab-adapter.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2101</sub>
- [2104 — Синхронизация статусов PR и комментариев ревью](21-git-hosting-and-triggers/2104-pr-status-sync.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2102</sub>
- [2105 — Входящие webhook-триггеры](21-git-hosting-and-triggers/2105-inbound-webhook-triggers.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1904, 0802</sub>
- [2106 — Запуск по расписанию](21-git-hosting-and-triggers/2106-scheduled-triggers.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 0802, 1003</sub>

### 22 · observability

- [2201 — Инициализация OpenTelemetry](22-observability/2201-otel-bootstrap.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: —</sub>
- [2202 — Маппинг внутренних метрик в OTel](22-observability/2202-metrics-mapping.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2201, 0608, 0807</sub>
- [2203 — Иерархия трейсов прогона](22-observability/2203-trace-hierarchy.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 2201</sub>
- [2204 — Read-модель экономики](22-observability/2204-cost-dashboard-read-model.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 0606</sub>
- [2205 — Расширение SLO/алертов на новые компоненты](22-observability/2205-slo-extension.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 0807, 2202</sub>
- [2206 — Диагностика «почему ничего не происходит»](22-observability/2206-stall-diagnostics.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1003, 0902</sub>

### 23 · web-ui

- [2301 — Каркас веб-приложения](23-web-ui/2301-ui-scaffold.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1910</sub>
- [2302 — Экраны проектов и прогонов](23-web-ui/2302-projects-and-runs-views.md)  <br/>  <sub>Фаза: P3 · Оценка: L · Зависит от: 2301, 1905, 1909</sub>
- [2303 — Живой таймлайн прогона](23-web-ui/2303-live-run-timeline.md)  <br/>  <sub>Фаза: P3 · Оценка: L · Зависит от: 2002, 2302</sub>
- [2304 — Просмотр диффа и evidence-бандла](23-web-ui/2304-diff-and-evidence-viewer.md)  <br/>  <sub>Фаза: P3 · Оценка: L · Зависит от: 2302</sub>
- [2305 — Inbox approvals](23-web-ui/2305-approvals-inbox-ui.md)  <br/>  <sub>Фаза: P3 · Оценка: M · Зависит от: 1909, 2304</sub>
- [2306 — Редактор агентов](23-web-ui/2306-agent-editor-ui.md)  <br/>  <sub>Фаза: P3 · Оценка: L · Зависит от: 1907, 2301</sub>
- [2307 — Экраны capabilities и экономики](23-web-ui/2307-capabilities-and-cost-ui.md)  <br/>  <sub>Фаза: P3 · Оценка: L · Зависит от: 1906, 1908, 2204</sub>

### 24 · cleanup-and-slimming

- [2401 — Миграция v15: удаление журналов из снимка состояния](24-cleanup-and-slimming/2401-migration-v15-drop-journal-fields.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 0207 (все читатели переведены)</sub>
- [2402 — Удаление фасада StateStore](24-cleanup-and-slimming/2402-remove-legacy-statestore-facade.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2401</sub>
- [2403 — Вывод синтетических ролей из продуктового пакета](24-cleanup-and-slimming/2403-retire-synthetic-roles.md)  <br/>  <sub>Фаза: P4 · Оценка: S · Зависит от: 1610</sub>
- [2404 — Ревизия зависимостей](24-cleanup-and-slimming/2404-dependency-audit.md)  <br/>  <sub>Фаза: P4 · Оценка: S · Зависит от: 1503</sub>

### 25 · evals-and-replay

- [2501 — Корпус фикстурных репозиториев](25-evals-and-replay/2501-fixture-repo-corpus.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: —</sub>
- [2502 — Харнесс прогонов evals](25-evals-and-replay/2502-eval-harness.md)  <br/>  <sub>Фаза: P4 · Оценка: L · Зависит от: 2501, 1611</sub>
- [2503 — Регрессионный набор для агентов](25-evals-and-replay/2503-agent-regression-suite.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2502</sub>
- [2504 — Воспроизведение прогона из evidence](25-evals-and-replay/2504-run-replay.md)  <br/>  <sub>Фаза: P4 · Оценка: L · Зависит от: 1612, 0310</sub>
- [2505 — Отчётность по evals](25-evals-and-replay/2505-eval-reporting.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2502</sub>

### 26 · sandbox-and-egress

- [2601 — Контракт egress-политики](26-sandbox-and-egress/2601-egress-policy-contract.md)  <br/>  <sub>Фаза: P4 · Оценка: S · Зависит от: 0302</sub>
- [2602 — Контейнерный workspace-менеджер](26-sandbox-and-egress/2602-container-workspace-manager.md)  <br/>  <sub>Фаза: P4 · Оценка: XL · Зависит от: 1103</sub>
- [2603 — Принуждение сетевого allow-list](26-sandbox-and-egress/2603-network-allowlist-enforcement.md)  <br/>  <sub>Фаза: P4 · Оценка: L · Зависит от: 2601, 2602</sub>
- [2604 — Профиль offline (полностью локальный контур)](26-sandbox-and-egress/2604-offline-profile.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2603, 0403</sub>

### 27 · memory-and-index

- [2701 — Поддержка эмбеддингов в LLM Gateway](27-memory-and-index/2701-embeddings-in-gateway.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 0304</sub>
- [2702 — Индекс репозитория](27-memory-and-index/2702-repo-index-service.md)  <br/>  <sub>Фаза: P4 · Оценка: L · Зависит от: 2701</sub>
- [2703 — Долговременная память проекта](27-memory-and-index/2703-project-memory-store.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2701</sub>
- [2704 — Извлечение памяти в контекст](27-memory-and-index/2704-memory-retrieval-in-context.md)  <br/>  <sub>Фаза: P4 · Оценка: M · Зависит от: 2703, 1402</sub>
- [2705 — Кластеризация отказов и предложение правил](27-memory-and-index/2705-failure-clustering.md)  <br/>  <sub>Фаза: P4 · Оценка: L · Зависит от: 2703, 1801</sub>
