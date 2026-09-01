# 0201 — Миграция v9: таблицы tenants / projects / repositories / project_configs

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0101, 0102
**Файлы:** `packages/state/src/postgres/migrations.ts`, `docs/runbooks/postgres-state-migrations.md`

## Контекст
Текущая требуемая версия схемы — 8 (`packages/state/src/postgres/migrations.ts:5`). Механика
`PostgresMigrationRunner` с чек-суммами уже есть, миграции добавляются аддитивно.

## Задача
Добавить миграцию id=9 с каталогом мультипроектности и поднять
`POSTGRES_REQUIRED_SCHEMA_VERSION` до 9.

## Объём
```sql
CREATE TABLE tenants (tenant_id TEXT PRIMARY KEY, name TEXT NOT NULL,
  status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE repositories (repository_id UUID PRIMARY KEY, tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL, remote_url TEXT NOT NULL, default_branch TEXT NOT NULL,
  credential_ref TEXT, protected_paths JSONB NOT NULL, verification_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL);

CREATE TABLE projects (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL,
  repository_id UUID NOT NULL REFERENCES repositories(repository_id),
  autonomy_level SMALLINT NOT NULL, status TEXT NOT NULL, config_version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (tenant_id, project_id));

CREATE TABLE project_configs (tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
  version INT NOT NULL, config_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL, PRIMARY KEY (tenant_id, project_id, version));
```
- Бэкофилл: создать запись tenant/project для текущей инсталляции из последнего снимка
  (`orgId`/`projectId`), чтобы существующие данные остались валидными.

## Критерии приёмки
- [ ] `pnpm run state:migrate` применяет v9 на чистой и на существующей БД.
- [ ] Режим `verify` корректно падает при несовпадении версии (существующее поведение).
- [ ] Чек-суммы миграций стабильны, ранбук обновлён.

## Тесты
- Интеграция: применение на пустой БД; идемпотентное повторное применение; бэкофилл.

## Не входит
- Скоуп-колонки в журналах (0204).
