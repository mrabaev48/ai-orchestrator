# 2201 — Инициализация OpenTelemetry

**Фаза:** P3 · **Оценка:** M · **Зависит от:** —
**Файлы:** `packages/shared/src/observability/otel.ts`, `apps/*/src/main.ts`

## Контекст
Внутренние стораджи уже пишут метрики и спаны (`packages/state/src/observability/*`),
`traceId` присутствует в evidence — не хватает экспорта наружу.

## Объём
Пакеты: `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-proto`,
`@opentelemetry/exporter-metrics-otlp-proto`, `@opentelemetry/sdk-metrics`.
```ts
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
  }),
});
sdk.start();
```

## Критерии приёмки
- [ ] Экспорт включается конфигурацией; при выключении зависимости не инициализируются.
- [ ] Недоступный коллектор не влияет на работу (ошибки экспорта не поднимаются в домен).
- [ ] Корректное завершение SDK при graceful shutdown (сброс буферов).

## Тесты
- Интеграция с фиктивным OTLP-приёмником: спаны и метрики доходят.
