# 0801 — Миграция v12: таблица run_queue

**Фаза:** P1 · **Оценка:** M · **Зависит от:** 0203
**Файлы:** `packages/state/src/postgres/migrations.ts`

## Объём
```sql
CREATE TABLE run_queue (
  id UUID PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
  task_id TEXT, agent_ref TEXT, priority SMALLINT NOT NULL DEFAULT 100,
  status TEXT NOT NULL, resource_keys TEXT[] NOT NULL,
  available_at TIMESTAMPTZ NOT NULL, lease_owner TEXT, lease_expires TIMESTAMPTZ,
  attempt INT NOT NULL DEFAULT 0, max_attempts INT NOT NULL DEFAULT 3,
  idempotency_key TEXT NOT NULL, payload_json JSONB NOT NULL,
  last_error_json JSONB, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
CREATE INDEX run_queue_pick_idx ON run_queue (status, available_at, priority);
CREATE INDEX run_queue_project_idx ON run_queue (tenant_id, project_id, status);
CREATE UNIQUE INDEX run_queue_idem_idx ON run_queue (tenant_id, project_id, idempotency_key);
```

## Критерии приёмки
- [ ] `POSTGRES_REQUIRED_SCHEMA_VERSION` = 12; ранбук обновлён.
- [ ] Индекс выборки покрывает запрос из 0803 (проверено `EXPLAIN`).

## Тесты
- Интеграция: применение миграции, уникальность идемпотентного ключа.
