# 0107 — Разделение RuntimeConfig на InstanceConfig и ProjectConfig

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0102
**Файлы:** `packages/shared/src/config/runtime-config.ts`, `packages/shared/src/config/instance-config.ts` (новый)

## Контекст
Текущая схема (707 строк) смешивает инфраструктурные настройки процесса (Postgres, логирование,
локи) и продуктовые политики (workflow, tools, budgets, llm), которые должны стать
пер-проектными.

## Задача
Выделить `InstanceConfig` (из env) и оставить продуктовые секции как дефолты, из которых
строится `ProjectConfig` по умолчанию для существующих инсталляций.

## Объём
- `InstanceConfig`: `state`, `logging`, `observability`, `queue`, `security`, `lock*`.
- Продуктовые секции (`workflow`, `tools`, `llm`) остаются читаемыми из env, но помечаются как
  «дефолты проекта» и проходят через `resolveEffectiveConfig`.
- Обратная совместимость: `loadRuntimeConfig()` сохраняется как композиция
  `loadInstanceConfig()` + `defaultProjectConfigFromEnv()`.
- Сохранить существующие проверки: `validateRuntimePolicy`, `validatePostgresPolicy`,
  `validateRuntimeFilesystemGuards`, регистрацию секретов.

## Критерии приёмки
- [ ] Все существующие env-переменные продолжают работать с теми же дефолтами.
- [ ] `tests/runtime-config.test.ts` проходит без изменений.
- [ ] Ошибки конфигурации по-прежнему приводят к hard-fail на старте.

## Тесты
- Регрессия: снапшот разрешённого конфига для набора env совпадает с текущим поведением.

## Не входит
- Чтение `ProjectConfig` из БД (0202).
