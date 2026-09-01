# 1909 — Эндпоинты прогонов и approvals

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 1904, 0802
**Файлы:** `apps/dashboard-api/src/write/runs.controller.ts`

## Эндпоинты
```
POST   /api/v1/projects/{id}/runs      поставить прогон в очередь
GET    /api/v1/runs                    фильтры: project, status, since
GET    /api/v1/runs/{runId}            статус, шаги, стоимость
POST   /api/v1/runs/{runId}/cancel
POST   /api/v1/runs/{runId}/interject  подсказка/коррекция (2005)
GET    /api/v1/approvals               inbox с фильтрами и SLA
POST   /api/v1/approvals/{id}/approve|reject   (существующие, переносятся в v1)
```

## Критерии приёмки
- [ ] Постановка прогона идемпотентна (1904).
- [ ] Отмена работает и для элемента в очереди, и для активного прогона.
- [ ] Inbox сортируется по близости нарушения SLA (движок эскалации уже есть).

## Тесты
- E2E: постановка, отмена в очереди, отмена активного, approve/reject.
