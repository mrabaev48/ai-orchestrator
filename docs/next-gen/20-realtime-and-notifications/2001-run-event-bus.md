# 2001 — Шина событий прогона

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 1004
**Файлы:** `packages/application/src/events/run-event-bus.ts`

## Задача
Единый поток событий: `run.queued`, `run.started`, `run.step.started`, `run.step.finished`,
`run.approval.requested`, `run.blocked`, `run.finished`, `cost.threshold.reached`.

## Критерии приёмки
- [ ] События производны от уже существующих domain events и evidence — без второго источника истины.
- [ ] Доставка «best effort» для UI и надёжная (с повтором) для webhooks (2003).
- [ ] События не содержат секретов (проходят `redactSecrets`).

## Тесты
- Юнит: маппинг доменных событий; интеграция: полный прогон даёт ожидаемую последовательность.
