# 0203 — Миграция v10: скоуп-колонки и индексы в журналах

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0201
**Файлы:** `packages/state/src/postgres/migrations.ts`

## Контекст
Часть таблиц уже несёт тенант/проект (`project_snapshots` имеет уникальный индекс
`project_snapshots_tenant_revision_idx`), остальные журналы — нет.

## Задача
Привести все журнальные таблицы к единому скоупу `(tenant_id, project_id)` и добавить индексы
под запросы read-моделей.

## Объём
- `ALTER TABLE ... ADD COLUMN tenant_id TEXT`, `project_id TEXT` для `domain_events`,
  `decision_log`, `failure_log`, `artifact_log`, `run_step_log`, `telemetry_*`, `policy_decisions`.
- Бэкофилл значениями текущего проекта, затем `SET NOT NULL`.
- Индексы: `(tenant_id, project_id, created_at DESC)` на каждом журнале;
  `(tenant_id, project_id, run_id, created_at DESC)` на `run_step_log`.

## Критерии приёмки
- [ ] Миграция применяется на существующей БД без потери данных.
- [ ] Все запросы read-моделей используют индекс (проверено `EXPLAIN` на 100k строк).
- [ ] `POSTGRES_REQUIRED_SCHEMA_VERSION` = 10.

## Тесты
- Интеграция: бэкофилл, `NOT NULL`, повторное применение.

## Не входит
- Изменение кода сторов (0204, 0205).
