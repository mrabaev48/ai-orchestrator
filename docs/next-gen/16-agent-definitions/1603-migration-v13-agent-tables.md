# 1603 — Миграция v13: agent_versions / agent_assignments

**Фаза:** P2 · **Оценка:** S · **Зависит от:** 0201
**Файлы:** `packages/state/src/postgres/migrations.ts`

## Объём
```sql
CREATE TABLE agent_versions (agent_id UUID NOT NULL, version INT NOT NULL, tenant_id TEXT NOT NULL,
  status TEXT NOT NULL, definition JSONB NOT NULL, checksum TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, created_by TEXT NOT NULL,
  PRIMARY KEY (agent_id, version));
CREATE INDEX agent_versions_tenant_status_idx ON agent_versions (tenant_id, status);

CREATE TABLE agent_assignments (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
  role_key TEXT NOT NULL, agent_id UUID NOT NULL, version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, project_id, role_key));
```

## Критерии приёмки
- [ ] `POSTGRES_REQUIRED_SCHEMA_VERSION` = 13; ранбук обновлён.
- [ ] Опубликованная версия иммутабельна: UPDATE запрещён триггером или проверкой в коде и тестом.

## Тесты
- Интеграция: попытка изменить published-версию → отказ.
