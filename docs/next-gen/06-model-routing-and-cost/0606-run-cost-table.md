# 0606 — Таблица run_cost и рекордер стоимости

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0605, 0502
**Файлы:** `packages/state/src/cost/run-cost.store.ts`, `packages/state/src/postgres/migrations.ts`

## Объём
```sql
CREATE TABLE run_cost (id UUID PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT NOT NULL,
  run_id UUID NOT NULL, task_id TEXT, agent_ref TEXT NOT NULL, provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL, input_tokens INT NOT NULL, output_tokens INT NOT NULL,
  cached_read_tokens INT NOT NULL DEFAULT 0, cache_write_tokens INT NOT NULL DEFAULT 0,
  cost_usd_micro BIGINT NOT NULL, estimated BOOLEAN NOT NULL, source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL);
CREATE INDEX run_cost_run_idx ON run_cost (run_id);
CREATE INDEX run_cost_project_day_idx ON run_cost (tenant_id, project_id, created_at DESC);
```

## Критерии приёмки
- [ ] Каждая LLM-операция даёт ровно одну строку (без двойного учёта при ретраях — ретрай это своя строка с `source='retry'`).
- [ ] Агрегаты «стоимость прогона/задачи/проекта за день» считаются одним запросом по индексу.
- [ ] Стоимость считается в целых микро-долларах (без плавающей точки).

## Тесты
- Интеграция: 1000 записей, агрегаты, сверка с суммой по прогону.
