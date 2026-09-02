# next-gen — очередь выполнения тасков

Статус выполнения всех тасков из [`README.md`](README.md). Обновляется вручную по мере работы.

## Легенда статусов

| Статус | Значение |
|---|---|
| ⬜ Не начат | Работа не начиналась |
| 🔄 В работе | Взято в разработку |
| 🔍 На ревью | Реализовано, ожидает проверки/мержа |
| ✅ Готово | Принято, критерии приёмки выполнены |
| 🚫 Заблокирован | Не может быть начат (ждёт зависимость/решение) |

**Всего тасков:** 182 · **Готово:** 2 · **В работе:** 0 · **Осталось:** 180

## 01 · foundation-contracts (P0)

| Таск | Название | Оценка | Зависит от | Статус     |
|---|---|---|---|------------|
| [0101](01-foundation-contracts/0101-tenant-project-repository-types.md) | Доменные типы Tenant / Project / Repository | S | — | ✅ Готово   |
| [0102](01-foundation-contracts/0102-project-config-contract.md) | Контракт ProjectConfig и правила наследования | M | 0101 | ✅ Готово   |
| [0103](01-foundation-contracts/0103-policy-narrowing-invariant.md) | Инвариант «дочерняя политика только сужает» | S | 0102 | ⬜ Не начат |
| [0104](01-foundation-contracts/0104-run-context-contract.md) | Контракт RunContext | S | 0101, 0102 | ⬜ Не начат |
| [0105](01-foundation-contracts/0105-scoped-state-store-port.md) | Порт ScopedStateStore | M | 0101 | ⬜ Не начат |
| [0106](01-foundation-contracts/0106-bindscope-legacy-adapter.md) | Адаптер bindScope: ScopedStateStore → StateStore | S | 0105 | ⬜ Не начат |
| [0107](01-foundation-contracts/0107-split-instance-and-project-config.md) | Разделение RuntimeConfig на InstanceConfig и ProjectConfig | M | 0102 | ⬜ Не начат |

## 02 · state-scoping-and-journals (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0201](02-state-scoping-and-journals/0201-migration-v9-catalog-tables.md) | Миграция v9: таблицы tenants / projects / repositories / project_configs | M | 0101, 0102 | ⬜ Не начат |
| [0202](02-state-scoping-and-journals/0202-project-catalog-repository.md) | Репозиторий каталога проектов (Postgres + in-memory) | M | 0201 | ⬜ Не начат |
| [0203](02-state-scoping-and-journals/0203-migration-v10-scope-columns.md) | Миграция v10: скоуп-колонки и индексы в журналах | M | 0201 | ⬜ Не начат |
| [0204](02-state-scoping-and-journals/0204-scoped-postgres-state-store.md) | Скоупированный PostgresStateStore | L | 0105, 0203 | ⬜ Не начат |
| [0205](02-state-scoping-and-journals/0205-scoped-in-memory-state-store.md) | Скоупированный InMemoryStateStore | M | 0105 | ⬜ Не начат |
| [0206](02-state-scoping-and-journals/0206-dual-write-journals.md) | Двойная запись журналов (снимок + таблицы) | M | 0204, 0205 | ⬜ Не начат |
| [0207](02-state-scoping-and-journals/0207-switch-read-path-to-journals.md) | Перевод читателей на журнальные таблицы | M | 0206 | ⬜ Не начат |
| [0208](02-state-scoping-and-journals/0208-state-integrity-for-scoped-store.md) | Проверка целостности состояния в скоупированном мире | S | 0207 | ⬜ Не начат |

## 03 · llm-gateway-core (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0301](03-llm-gateway-core/0301-chat-contracts.md) | Контракты чата: сообщения, инструменты, usage | M | — | ⬜ Не начат |
| [0302](03-llm-gateway-core/0302-provider-and-model-descriptors.md) | ProviderRegistration и ModelDescriptor | S | 0301 | ⬜ Не начат |
| [0303](03-llm-gateway-core/0303-error-taxonomy.md) | Таксономия ошибок LLM и нормализация | S | 0301 | ⬜ Не начат |
| [0304](03-llm-gateway-core/0304-adapter-port-and-registry.md) | Порт ModelProviderAdapter и реестр провайдеров | M | 0302, 0303 | ⬜ Не начат |
| [0305](03-llm-gateway-core/0305-http-transport-retry.md) | HTTP-транспорт: таймауты, ретраи, джиттер | M | 0303 | ⬜ Не начат |
| [0306](03-llm-gateway-core/0306-circuit-breaker.md) | Circuit breaker на провайдера | S | 0305 | ⬜ Не начат |
| [0307](03-llm-gateway-core/0307-structured-output-strategies.md) | Стратегии structured output и их деградация | L | 0302 | ⬜ Не начат |
| [0308](03-llm-gateway-core/0308-schema-repair-pass.md) | Repair-проход при невалидном JSON | S | 0307 | ⬜ Не начат |
| [0309](03-llm-gateway-core/0309-legacy-llmclient-adapter.md) | Совместимость: LlmClient поверх Gateway | S | 0304, 0307 | ⬜ Не начат |
| [0310](03-llm-gateway-core/0310-llm-cassettes.md) | Кассеты запись/воспроизведение ответов LLM | M | 0304 | ⬜ Не начат |

## 04 · llm-providers (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0401](04-llm-providers/0401-openai-responses-adapter.md) | Адаптер OpenAI Responses | M | 0304, 0307 | ⬜ Не начат |
| [0402](04-llm-providers/0402-openai-compatible-adapter.md) | Универсальный адаптер OpenAI-compatible (vLLM, LM Studio, llama.cpp, OpenRouter) | M | 0304, 0307 | ⬜ Не начат |
| [0403](04-llm-providers/0403-ollama-adapter.md) | Нативный адаптер Ollama | M | 0304, 0307 | ⬜ Не начат |
| [0404](04-llm-providers/0404-anthropic-adapter.md) | Адаптер Anthropic Messages (tool use + prompt caching) | M | 0304, 0307 | ⬜ Не начат |
| [0405](04-llm-providers/0405-health-and-model-discovery.md) | Health-check и дискавери моделей | S | 0401, 0402, 0403, 0404 | ⬜ Не начат |
| [0406](04-llm-providers/0406-provider-concurrency-limiter.md) | Ограничитель конкурентности на провайдера | S | 0304 | ⬜ Не начат |
| [0407](04-llm-providers/0407-mock-provider-and-fixtures.md) | Mock-провайдер и общий набор фикстур | S | 0304 | ⬜ Не начат |
| [0408](04-llm-providers/0408-additional-cloud-adapters.md) | Дополнительные облачные адаптеры (Google, Azure OpenAI, Bedrock) | L | 0401, 0402 | ⬜ Не начат |

## 05 · credentials-and-catalog (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0501](05-credentials-and-catalog/0501-credential-store-port.md) | Порт CredentialStore | S | 0302 | ⬜ Не начат |
| [0502](05-credentials-and-catalog/0502-migration-v11-provider-tables.md) | Миграция v11: providers / models / credentials | M | 0201, 0501 | ⬜ Не начат |
| [0503](05-credentials-and-catalog/0503-encrypted-credential-store.md) | Шифрованное хранилище кредов (AES-256-GCM) | M | 0501, 0502 | ⬜ Не начат |
| [0504](05-credentials-and-catalog/0504-secret-redaction-coverage.md) | Расширение редакции секретов на провайдеров | S | 0503 | ⬜ Не начат |
| [0505](05-credentials-and-catalog/0505-provider-catalog-service.md) | Сервис каталога провайдеров и моделей | M | 0304, 0405, 0502 | ⬜ Не начат |

## 06 · model-routing-and-cost (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0601](06-model-routing-and-cost/0601-routing-policy-contract.md) | Контракт политики маршрутизации моделей | S | 0302 | ⬜ Не начат |
| [0602](06-model-routing-and-cost/0602-routing-resolver.md) | Резолвер маршрутизации с ограничениями и здоровьем | M | 0601, 0405 | ⬜ Не начат |
| [0603](06-model-routing-and-cost/0603-fallback-chain.md) | Исполнитель цепочки fallback | M | 0602, 0305, 0306 | ⬜ Не начат |
| [0604](06-model-routing-and-cost/0604-wire-real-role-model-selection.md) | Реальный выбор модели по роли/агенту | M | 0602, 0309 | ⬜ Не начат |
| [0605](06-model-routing-and-cost/0605-usage-based-accounting.md) | Учёт токенов по фактическому usage | M | 0301, 0604 | ⬜ Не начат |
| [0606](06-model-routing-and-cost/0606-run-cost-table.md) | Таблица run_cost и рекордер стоимости | M | 0605, 0502 | ⬜ Не начат |
| [0607](06-model-routing-and-cost/0607-budget-enforcement.md) | Принудительные бюджеты на фактической стоимости | M | 0606, 0102 | ⬜ Не начат |
| [0608](06-model-routing-and-cost/0608-cost-and-model-metrics.md) | Метрики стоимости и выбора модели | S | 0605, 0606 | ⬜ Не начат |

## 07 · multiproject-runtime (P0)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0701](07-multiproject-runtime/0701-runtime-factory-per-project.md) | Фабрика рантайма на проект | L | 0104, 0106, 0202, 0505 | ⬜ Не начат |
| [0702](07-multiproject-runtime/0702-project-lifecycle-service.md) | Сервис жизненного цикла проекта | M | 0202, 0701 | ⬜ Не начат |
| [0703](07-multiproject-runtime/0703-cli-project-commands.md) | CLI-команды для проектов | M | 0702 | ⬜ Не начат |
| [0704](07-multiproject-runtime/0704-cli-provider-commands.md) | CLI-команды для провайдеров моделей | S | 0505 | ⬜ Не начат |
| [0705](07-multiproject-runtime/0705-bootstrap-per-project.md) | Bootstrap в мультипроектном режиме | M | 0701, 0703 | ⬜ Не начат |
| [0706](07-multiproject-runtime/0706-two-projects-e2e.md) | E2E: два проекта, два провайдера (в т.ч. локальный) | M | 0604, 0701, 0705 | ⬜ Не начат |

## 08 · run-queue (P1)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0801](08-run-queue/0801-migration-v12-run-queue.md) | Миграция v12: таблица run_queue | M | 0203 | ⬜ Не начат |
| [0802](08-run-queue/0802-queue-port-contracts.md) | Порт и контракты очереди прогонов | S | 0801 | ⬜ Не начат |
| [0803](08-run-queue/0803-postgres-queue-skip-locked.md) | Postgres-реализация очереди (FOR UPDATE SKIP LOCKED) | M | 0802 | ⬜ Не начат |
| [0804](08-run-queue/0804-queue-idempotency.md) | Идемпотентность постановки в очередь | S | 0803 | ⬜ Не начат |
| [0805](08-run-queue/0805-queue-lease-reaper.md) | Reaper просроченных лиз очереди | S | 0803 | ⬜ Не начат |
| [0806](08-run-queue/0806-dead-letter-integration.md) | Интеграция очереди с dead-letter и replay | M | 0805 | ⬜ Не начат |
| [0807](08-run-queue/0807-queue-metrics.md) | Метрики очереди | S | 0803 | ⬜ Не начат |

## 09 · resource-locks (P1)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [0901](09-resource-locks/0901-resource-key-model.md) | Модель ресурсных ключей | S | 0101 | ⬜ Не начат |
| [0902](09-resource-locks/0902-resource-claim-planner.md) | Планировщик заявок на ресурсы | M | 0901 | ⬜ Не начат |
| [0903](09-resource-locks/0903-ordered-multi-resource-acquisition.md) | Упорядоченный захват нескольких ресурсов | M | 0902 | ⬜ Не начат |
| [0904](09-resource-locks/0904-replace-global-run-lock.md) | Замена глобальной блокировки прогона | M | 0903 | ⬜ Не начат |
| [0905](09-resource-locks/0905-shared-and-exclusive-modes.md) | Режимы shared / exclusive в lock-store | M | 0903 | ⬜ Не начат |
| [0906](09-resource-locks/0906-lock-property-tests.md) | Property-тесты на отсутствие взаимных блокировок | M | 0904, 0905 | ⬜ Не начат |

## 10 · scheduler-and-worker-pool (P1)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1001](10-scheduler-and-worker-pool/1001-scheduler-policy-contract.md) | Контракт политики планировщика | S | 0802 | ⬜ Не начат |
| [1002](10-scheduler-and-worker-pool/1002-fair-share-selection.md) | Справедливое распределение между проектами | M | 1001, 0803 | ⬜ Не начат |
| [1003](10-scheduler-and-worker-pool/1003-backpressure-and-block-reasons.md) | Backpressure и фиксация причин отказа | M | 1001, 0607, 0702 | ⬜ Не начат |
| [1004](10-scheduler-and-worker-pool/1004-worker-pool-runtime.md) | Пул воркеров вместо одиночного цикла | L | 0803, 1002, 1003 | ⬜ Не начат |
| [1005](10-scheduler-and-worker-pool/1005-graceful-shutdown.md) | Мягкое завершение и дренаж | M | 1004 | ⬜ Не начат |
| [1006](10-scheduler-and-worker-pool/1006-worker-mode-switch.md) | Переключатель режима воркера poll/queue | S | 1004 | ⬜ Не начат |
| [1007](10-scheduler-and-worker-pool/1007-concurrency-load-test.md) | Нагрузочный профиль параллельного исполнения | M | 1004, 0904 | ⬜ Не начат |
| [1008](10-scheduler-and-worker-pool/1008-chaos-worker-kill.md) | Chaos: убийство воркера в середине мутации | M | 1005, 0806 | ⬜ Не начат |

## 11 · parallel-tasks (P1)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1101](11-parallel-tasks/1101-task-conflict-detection.md) | Детектор конфликтов между задачами | M | 0904 | ⬜ Не начат |
| [1102](11-parallel-tasks/1102-parallel-task-selection.md) | Выбор набора параллельных задач | M | 1101 | ⬜ Не начат |
| [1103](11-parallel-tasks/1103-per-task-branch-and-worktree.md) | Своя ветка и worktree на задачу | M | 1102, 0904 | ⬜ Не начат |
| [1104](11-parallel-tasks/1104-merge-queue-service.md) | Merge queue для параллельных задач | L | 1103 | ⬜ Не начат |
| [1105](11-parallel-tasks/1105-rebase-and-reverify.md) | Ребейз и повторная верификация | M | 1104 | ⬜ Не начат |
| [1106](11-parallel-tasks/1106-conflict-escalation.md) | Политика эскалации конфликтов | S | 1105 | ⬜ Не начат |

## 12 · tool-registry (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1201](12-tool-registry/1201-open-toolcallname-union.md) | Открытие закрытого union ToolCallName | M | — | ⬜ Не начат |
| [1202](12-tool-registry/1202-tool-descriptor-and-registry.md) | ToolDescriptor и реестр инструментов | M | 1201 | ⬜ Не начат |
| [1203](12-tool-registry/1203-local-adapters-registration.md) | Регистрация локальных адаптеров в реестре | S | 1202 | ⬜ Не начат |
| [1204](12-tool-registry/1204-risk-class-binding.md) | Привязка класса риска к гейтам | M | 1202 | ⬜ Не начат |
| [1205](12-tool-registry/1205-tool-schema-exposure.md) | Экспорт схем инструментов в формат модели | S | 1202 | ⬜ Не начат |

## 13 · messages-action-loop (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1301](13-messages-action-loop/1301-role-generation-port-v2.md) | RoleGenerationPort v2 на сообщениях | M | 0301, 0604 | ⬜ Не начат |
| [1302](13-messages-action-loop/1302-native-tool-calling-bridge.md) | Мост к нативному tool-calling | L | 1301, 1205 | ⬜ Не начат |
| [1303](13-messages-action-loop/1303-observation-as-tool-message.md) | Наблюдения как сообщения роли tool | M | 1302 | ⬜ Не начат |
| [1304](13-messages-action-loop/1304-observation-compression.md) | Сжатие старых наблюдений | M | 1303 | ⬜ Не начат |
| [1305](13-messages-action-loop/1305-prompt-cache-hints.md) | Подсказки кэширования промпта | M | 1303, 0404 | ⬜ Не начат |
| [1306](13-messages-action-loop/1306-migrate-production-coder.md) | Перевод ProductionCoderRole на сообщения | M | 1302, 1304 | ⬜ Не начат |
| [1307](13-messages-action-loop/1307-migrate-production-reviewer.md) | Перевод ProductionReviewerRole на сообщения | S | 1306 | ⬜ Не начат |
| [1308](13-messages-action-loop/1308-loop-budget-parity-tests.md) | Паритет бюджетов и отмены после миграции цикла | M | 1306, 1307 | ⬜ Не начат |

## 14 · context-assembler (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1401](14-context-assembler/1401-context-budget-model.md) | Модель бюджета контекста | S | 0302 | ⬜ Не начат |
| [1402](14-context-assembler/1402-assembler-pipeline.md) | Пайплайн сборки контекста | L | 1401 | ⬜ Не начат |
| [1403](14-context-assembler/1403-eviction-priorities.md) | Приоритеты вытеснения при нехватке бюджета | M | 1402, 1304 | ⬜ Не начат |
| [1404](14-context-assembler/1404-state-summary-v2.md) | Сводка состояния v2 с бюджетом | M | 1401 | ⬜ Не начат |
| [1405](14-context-assembler/1405-assembler-tests.md) | Тестовый набор сборщика контекста | M | 1402, 1403 | ⬜ Не начат |

## 15 · mcp-integration (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1501](15-mcp-integration/1501-mcp-registration-contract.md) | Контракт регистрации MCP-сервера | S | 1202 | ⬜ Не начат |
| [1502](15-mcp-integration/1502-migration-v14-capabilities.md) | Миграция v14: mcp_servers / skills / rules / bindings | M | 0201 | ⬜ Не начат |
| [1503](15-mcp-integration/1503-mcp-client-stdio.md) | MCP-клиент: транспорт stdio | M | 1501 | ⬜ Не начат |
| [1504](15-mcp-integration/1504-mcp-client-http.md) | MCP-клиент: транспорт streamable HTTP | M | 1501 | ⬜ Не начат |
| [1505](15-mcp-integration/1505-mcp-connection-pool.md) | Пул соединений и жизненный цикл MCP | M | 1503, 1504 | ⬜ Не начат |
| [1506](15-mcp-integration/1506-mcp-discovery-and-namespacing.md) | Обнаружение инструментов и неймспейсинг | M | 1505, 1202 | ⬜ Не начат |
| [1507](15-mcp-integration/1507-mcp-tool-adapter.md) | Адаптер вызова MCP-инструмента в реестре | M | 1506 | ⬜ Не начат |
| [1508](15-mcp-integration/1508-mcp-risk-defaults-and-approval.md) | Классы риска и approvals для MCP-инструментов | S | 1507, 1204 | ⬜ Не начат |
| [1509](15-mcp-integration/1509-mcp-untrusted-output-isolation.md) | Изоляция недоверенного вывода MCP | M | 1507, 1402 | ⬜ Не начат |
| [1510](15-mcp-integration/1510-mcp-fixture-server-and-tests.md) | Фикстурный MCP-сервер и тестовый набор | M | 1503, 1504 | ⬜ Не начат |

## 16 · agent-definitions (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1601](16-agent-definitions/1601-open-rolekey-union.md) | Открытие AgentRoleName → RoleKey | M | — | ⬜ Не начат |
| [1602](16-agent-definitions/1602-agent-definition-schema.md) | Схема AgentDefinition | M | 1601, 0103 | ⬜ Не начат |
| [1603](16-agent-definitions/1603-migration-v13-agent-tables.md) | Миграция v13: agent_versions / agent_assignments | S | 0201 | ⬜ Не начат |
| [1604](16-agent-definitions/1604-agent-repository-and-versioning.md) | Репозиторий агентов и версионирование | M | 1602, 1603 | ⬜ Не начат |
| [1605](16-agent-definitions/1605-policy-escalation-check.md) | Проверка неэскалации прав агента | S | 0103, 1602 | ⬜ Не начат |
| [1606](16-agent-definitions/1606-agent-validation-pipeline.md) | Пайплайн валидации при публикации агента | M | 1604, 1605 | ⬜ Не начат |
| [1607](16-agent-definitions/1607-declarative-agent-runtime.md) | Обобщённый рантайм декларативного агента | L | 1302, 1602, 1402 | ⬜ Не начат |
| [1608](16-agent-definitions/1608-agent-compiler-and-cache.md) | Компилятор определений и кэш | M | 1607 | ⬜ Не начат |
| [1609](16-agent-definitions/1609-seed-builtin-agents.md) | Seed 12 встроенных ролей как определений | M | 1604, 1602 | ⬜ Не начат |
| [1610](16-agent-definitions/1610-parity-builtin-vs-declarative.md) | Паритет: TS-роль против декларативной | L | 1607, 1609 | ⬜ Не начат |
| [1611](16-agent-definitions/1611-agent-dry-run-sandbox.md) | Песочница dry-run для агента | M | 1607, 0310 | ⬜ Не начат |
| [1612](16-agent-definitions/1612-agent-ref-in-evidence.md) | agentRef в evidence и в стоимости | S | 1607, 0606 | ⬜ Не начат |

## 17 · skills (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1701](17-skills/1701-skill-definition-and-store.md) | Модель Skill и хранилище | M | 1502 | ⬜ Не начат |
| [1702](17-skills/1702-skill-loader-and-lock.md) | Загрузчик скиллов и lock-файл с чек-суммами | M | 1701 | ⬜ Не начат |
| [1703](17-skills/1703-progressive-disclosure-catalog.md) | Каталог скиллов и прогрессивное раскрытие | M | 1701, 1402 | ⬜ Не начат |
| [1704](17-skills/1704-skill-load-tool.md) | Инструмент skill_load | S | 1703, 1202 | ⬜ Не начат |
| [1705](17-skills/1705-skill-bindings.md) | Привязка скиллов к агенту и проекту | S | 1701, 1502 | ⬜ Не начат |

## 18 · rules (P2)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1801](18-rules/1801-rule-contract-and-scopes.md) | Контракт Rule и скоупы | M | 1502 | ⬜ Не начат |
| [1802](18-rules/1802-rule-resolution-precedence.md) | Разрешение и приоритеты правил | M | 1801 | ⬜ Не начат |
| [1803](18-rules/1803-guidance-injection.md) | Инжекция guidance-правил в контекст | S | 1802, 1402 | ⬜ Не начат |
| [1804](18-rules/1804-enforced-rule-predicates.md) | Исполнение enforced-предикатов | M | 1801 | ⬜ Не начат |
| [1805](18-rules/1805-policy-engine-integration.md) | Встраивание правил в policy engine | M | 1804 | ⬜ Не начат |
| [1806](18-rules/1806-rule-set-in-evidence.md) | Фиксация набора правил в evidence | S | 1802, 1612 | ⬜ Не начат |

## 19 · control-plane-api (P3)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [1901](19-control-plane-api/1901-api-read-write-split.md) | Разделение API на read и write модули | M | 0702 | ⬜ Не начат |
| [1902](19-control-plane-api/1902-api-auth-and-scopes.md) | Аутентификация: API-ключи и JWT-скоупы | M | 1901, 0503 | ⬜ Не начат |
| [1903](19-control-plane-api/1903-rbac-shared-module.md) | Вынос RBAC/ABAC в общий модуль | M | 1902 | ⬜ Не начат |
| [1904](19-control-plane-api/1904-idempotency-middleware.md) | Idempotency-Key для мутирующих запросов | M | 1901, 0804 | ⬜ Не начат |
| [1905](19-control-plane-api/1905-projects-endpoints.md) | Эндпоинты проектов и репозиториев | M | 1901, 0702 | ⬜ Не начат |
| [1906](19-control-plane-api/1906-providers-endpoints.md) | Эндпоинты провайдеров и моделей | M | 1901, 0505 | ⬜ Не начат |
| [1907](19-control-plane-api/1907-agents-endpoints.md) | Эндпоинты агентов | M | 1901, 1604, 1611 | ⬜ Не начат |
| [1908](19-control-plane-api/1908-capabilities-endpoints.md) | Эндпоинты MCP / skills / rules | M | 1901, 1501, 1701, 1801 | ⬜ Не начат |
| [1909](19-control-plane-api/1909-runs-and-approvals-endpoints.md) | Эндпоинты прогонов и approvals | M | 1904, 0802 | ⬜ Не начат |
| [1910](19-control-plane-api/1910-openapi-contract.md) | OpenAPI-контракт и контрактные тесты | M | 1905, 1906, 1907, 1908, 1909 | ⬜ Не начат |

## 20 · realtime-and-notifications (P3)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2001](20-realtime-and-notifications/2001-run-event-bus.md) | Шина событий прогона | M | 1004 | ⬜ Не начат |
| [2002](20-realtime-and-notifications/2002-sse-stream-endpoint.md) | SSE-поток прогона | M | 2001, 1902 | ⬜ Не начат |
| [2003](20-realtime-and-notifications/2003-webhook-dispatcher.md) | Исходящие webhooks | M | 2001 | ⬜ Не начат |
| [2004](20-realtime-and-notifications/2004-notifications.md) | Уведомления (Slack / Telegram / email) | M | 2001 | ⬜ Не начат |
| [2005](20-realtime-and-notifications/2005-run-interjection.md) | Вмешательство человека в идущий прогон | M | 1909, 1402 | ⬜ Не начат |

## 21 · git-hosting-and-triggers (P3)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2101](21-git-hosting-and-triggers/2101-git-hosting-port.md) | Порт git-хостинга | M | 0101 | ⬜ Не начат |
| [2102](21-git-hosting-and-triggers/2102-github-adapter.md) | Адаптер GitHub | M | 2101, 0503 | ⬜ Не начат |
| [2103](21-git-hosting-and-triggers/2103-gitlab-adapter.md) | Адаптер GitLab | M | 2101 | ⬜ Не начат |
| [2104](21-git-hosting-and-triggers/2104-pr-status-sync.md) | Синхронизация статусов PR и комментариев ревью | M | 2102 | ⬜ Не начат |
| [2105](21-git-hosting-and-triggers/2105-inbound-webhook-triggers.md) | Входящие webhook-триггеры | M | 1904, 0802 | ⬜ Не начат |
| [2106](21-git-hosting-and-triggers/2106-scheduled-triggers.md) | Запуск по расписанию | M | 0802, 1003 | ⬜ Не начат |

## 22 · observability (P3)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2201](22-observability/2201-otel-bootstrap.md) | Инициализация OpenTelemetry | M | — | ⬜ Не начат |
| [2202](22-observability/2202-metrics-mapping.md) | Маппинг внутренних метрик в OTel | M | 2201, 0608, 0807 | ⬜ Не начат |
| [2203](22-observability/2203-trace-hierarchy.md) | Иерархия трейсов прогона | M | 2201 | ⬜ Не начат |
| [2204](22-observability/2204-cost-dashboard-read-model.md) | Read-модель экономики | M | 0606 | ⬜ Не начат |
| [2205](22-observability/2205-slo-extension.md) | Расширение SLO/алертов на новые компоненты | M | 0807, 2202 | ⬜ Не начат |
| [2206](22-observability/2206-stall-diagnostics.md) | Диагностика «почему ничего не происходит» | M | 1003, 0902 | ⬜ Не начат |

## 23 · web-ui (P3)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2301](23-web-ui/2301-ui-scaffold.md) | Каркас веб-приложения | M | 1910 | ⬜ Не начат |
| [2302](23-web-ui/2302-projects-and-runs-views.md) | Экраны проектов и прогонов | L | 2301, 1905, 1909 | ⬜ Не начат |
| [2303](23-web-ui/2303-live-run-timeline.md) | Живой таймлайн прогона | L | 2002, 2302 | ⬜ Не начат |
| [2304](23-web-ui/2304-diff-and-evidence-viewer.md) | Просмотр диффа и evidence-бандла | L | 2302 | ⬜ Не начат |
| [2305](23-web-ui/2305-approvals-inbox-ui.md) | Inbox approvals | M | 1909, 2304 | ⬜ Не начат |
| [2306](23-web-ui/2306-agent-editor-ui.md) | Редактор агентов | L | 1907, 2301 | ⬜ Не начат |
| [2307](23-web-ui/2307-capabilities-and-cost-ui.md) | Экраны capabilities и экономики | L | 1906, 1908, 2204 | ⬜ Не начат |

## 24 · cleanup-and-slimming (P4)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2401](24-cleanup-and-slimming/2401-migration-v15-drop-journal-fields.md) | Миграция v15: удаление журналов из снимка состояния | M | 0207 (все читатели переведены) | ⬜ Не начат |
| [2402](24-cleanup-and-slimming/2402-remove-legacy-statestore-facade.md) | Удаление фасада StateStore | M | 2401 | ⬜ Не начат |
| [2403](24-cleanup-and-slimming/2403-retire-synthetic-roles.md) | Вывод синтетических ролей из продуктового пакета | S | 1610 | ⬜ Не начат |
| [2404](24-cleanup-and-slimming/2404-dependency-audit.md) | Ревизия зависимостей | S | 1503 | ⬜ Не начат |

## 25 · evals-and-replay (P4)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2501](25-evals-and-replay/2501-fixture-repo-corpus.md) | Корпус фикстурных репозиториев | M | — | ⬜ Не начат |
| [2502](25-evals-and-replay/2502-eval-harness.md) | Харнесс прогонов evals | L | 2501, 1611 | ⬜ Не начат |
| [2503](25-evals-and-replay/2503-agent-regression-suite.md) | Регрессионный набор для агентов | M | 2502 | ⬜ Не начат |
| [2504](25-evals-and-replay/2504-run-replay.md) | Воспроизведение прогона из evidence | L | 1612, 0310 | ⬜ Не начат |
| [2505](25-evals-and-replay/2505-eval-reporting.md) | Отчётность по evals | M | 2502 | ⬜ Не начат |

## 26 · sandbox-and-egress (P4)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2601](26-sandbox-and-egress/2601-egress-policy-contract.md) | Контракт egress-политики | S | 0302 | ⬜ Не начат |
| [2602](26-sandbox-and-egress/2602-container-workspace-manager.md) | Контейнерный workspace-менеджер | XL | 1103 | ⬜ Не начат |
| [2603](26-sandbox-and-egress/2603-network-allowlist-enforcement.md) | Принуждение сетевого allow-list | L | 2601, 2602 | ⬜ Не начат |
| [2604](26-sandbox-and-egress/2604-offline-profile.md) | Профиль offline (полностью локальный контур) | M | 2603, 0403 | ⬜ Не начат |

## 27 · memory-and-index (P4)

| Таск | Название | Оценка | Зависит от | Статус |
|---|---|---|---|---|
| [2701](27-memory-and-index/2701-embeddings-in-gateway.md) | Поддержка эмбеддингов в LLM Gateway | M | 0304 | ⬜ Не начат |
| [2702](27-memory-and-index/2702-repo-index-service.md) | Индекс репозитория | L | 2701 | ⬜ Не начат |
| [2703](27-memory-and-index/2703-project-memory-store.md) | Долговременная память проекта | M | 2701 | ⬜ Не начат |
| [2704](27-memory-and-index/2704-memory-retrieval-in-context.md) | Извлечение памяти в контекст | M | 2703, 1402 | ⬜ Не начат |
| [2705](27-memory-and-index/2705-failure-clustering.md) | Кластеризация отказов и предложение правил | L | 2703, 1801 | ⬜ Не начат |

