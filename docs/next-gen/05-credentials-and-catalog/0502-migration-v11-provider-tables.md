# 0502 — Миграция v11: providers / models / credentials

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0201, 0501
**Файлы:** `packages/state/src/postgres/migrations.ts`

## Объём
```sql
CREATE TABLE providers (provider_id TEXT NOT NULL, tenant_id TEXT NOT NULL, kind TEXT NOT NULL,
  base_url TEXT, credential_ref TEXT, default_headers JSONB, egress_class TEXT NOT NULL,
  max_concurrent_requests INT, enabled BOOLEAN NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, provider_id));

CREATE TABLE models (tenant_id TEXT NOT NULL, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
  context_window INT NOT NULL, max_output_tokens INT NOT NULL, capabilities_json JSONB NOT NULL,
  cost_json JSONB NOT NULL, discovered_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, provider_id, model_id));

CREATE TABLE credentials (tenant_id TEXT NOT NULL, ref TEXT NOT NULL, ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL, key_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, rotated_at TIMESTAMPTZ, PRIMARY KEY (tenant_id, ref));
```

## Критерии приёмки
- [ ] `POSTGRES_REQUIRED_SCHEMA_VERSION` = 11, ранбук обновлён.
- [ ] Открытых текстовых секретов в схеме нет ни одного поля.
- [ ] Миграция аддитивна и идемпотентна.

## Тесты
- Интеграция: применение, повторное применение, откат по чек-сумме при подмене.
