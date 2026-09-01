# 0608 — Метрики стоимости и выбора модели

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0605, 0606
**Файлы:** `packages/execution/src/telemetry.ts`

## Задача
Привести набор LLM-метрик к финальному виду (потребляется дашбордом 2204 и OTel-экспортом 2202).

## Метрики
- `llm_request_total{provider, model, agent, outcome}`
- `llm_tokens_total{provider, model, direction=input|output|cache_read|cache_write, estimated}`
- `llm_cost_usd_micro_total{provider, model, project, agent}`
- `llm_latency_ms{provider, model}` (histogram)
- `llm_fallback_total{from_model, to_model, reason}`
- `schema_repair_total{model, strategy, outcome}`

## Критерии приёмки
- [ ] Кардинальность тегов ограничена (никаких `runId`/`taskId` в тегах метрик).
- [ ] Метрики пишутся через существующий `ObservabilityStore`, а не в домен-события
      (см. решение из коммита «separate telemetry store from domain events»).

## Тесты
- Юнит: набор ожидаемых метрик после одного прогона на mock-провайдере.
