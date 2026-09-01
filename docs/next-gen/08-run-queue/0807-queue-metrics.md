# 0807 — Метрики очереди

**Фаза:** P1 · **Оценка:** S · **Зависит от:** 0803
**Файлы:** `packages/execution/src/telemetry.ts`

## Метрики
- `queue_depth{project, status}` (gauge)
- `queue_wait_seconds{project}` (histogram) — от `created_at` до `lease`
- `queue_lease_expired_total`
- `queue_dead_letter_total{reason}`

## Критерии приёмки
- [ ] `queue_depth` снимается периодически одним агрегирующим запросом, не построчно.
- [ ] Теги не содержат `runId`/`taskId`.

## Тесты
- Юнит на маппинг; интеграция: после N постановок глубина очереди корректна.
