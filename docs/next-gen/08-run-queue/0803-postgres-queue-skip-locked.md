# 0803 — Postgres-реализация очереди (FOR UPDATE SKIP LOCKED)

**Фаза:** P1 · **Оценка:** M · **Зависит от:** 0802
**Файлы:** `packages/state/src/queue/postgres-run-queue.ts`

## Реализация
```sql
WITH candidate AS (
  SELECT id FROM run_queue
  WHERE status = 'queued' AND available_at <= now()
  ORDER BY priority, available_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE run_queue q
   SET status = 'leased', lease_owner = $1, lease_expires = now() + $2::interval,
       attempt = attempt + 1, updated_at = now()
  FROM candidate WHERE q.id = candidate.id
RETURNING q.*;
```

## Критерии приёмки
- [ ] 10 параллельных воркеров не получают одну и ту же запись (тест на реальной БД).
- [ ] Транзакция короткая: захват и обработка разделены (обработка вне транзакции, под heartbeat).
- [ ] Фильтр по проекту/приоритету не ломает использование индекса.

## Тесты
- Интеграция: конкурентный забор, отсутствие дублей, порядок по приоритету.
