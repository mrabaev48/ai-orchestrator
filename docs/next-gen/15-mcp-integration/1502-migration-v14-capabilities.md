# 1502 — Миграция v14: mcp_servers / skills / rules / bindings

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 0201
**Файлы:** `packages/state/src/postgres/migrations.ts`

## Объём
```sql
CREATE TABLE mcp_servers (tenant_id TEXT NOT NULL, server_id TEXT NOT NULL, scope TEXT NOT NULL,
  project_id TEXT, transport_json JSONB NOT NULL, credential_refs JSONB NOT NULL,
  allowed_tools JSONB, risk_overrides JSONB, enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (tenant_id, server_id));

CREATE TABLE skills (tenant_id TEXT NOT NULL, skill_id TEXT NOT NULL, version TEXT NOT NULL,
  name TEXT NOT NULL, description TEXT NOT NULL, triggers JSONB NOT NULL,
  body TEXT NOT NULL, resources_json JSONB NOT NULL, source_json JSONB NOT NULL,
  checksum TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, skill_id, version));

CREATE TABLE rules (tenant_id TEXT NOT NULL, rule_id TEXT NOT NULL, scope_level TEXT NOT NULL,
  selector TEXT, priority INT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  text TEXT NOT NULL, predicate_json JSONB, enabled BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (tenant_id, rule_id));

CREATE TABLE capability_bindings (tenant_id TEXT NOT NULL, owner_kind TEXT NOT NULL,
  owner_id TEXT NOT NULL, capability_kind TEXT NOT NULL, capability_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, owner_kind, owner_id, capability_kind, capability_id));
```

## Критерии приёмки
- [ ] `POSTGRES_REQUIRED_SCHEMA_VERSION` = 14; ранбук обновлён.
- [ ] Индексы под выборку «capabilities агента/проекта» присутствуют.

## Тесты
- Интеграция: применение и повторное применение.
