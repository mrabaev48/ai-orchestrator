# 0102 — Контракт ProjectConfig и правила наследования

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0101
**Файлы:** `packages/core/src/config/project-config.ts` (новый), `packages/core/src/index.ts`

## Контекст
`loadRuntimeConfig()` (`packages/shared/src/config/runtime-config.ts`) строит один
процесс-глобальный конфиг из `process.env`. Выразить «у проекта A политика X, у проекта B — Y»
негде, а именно это нужно для мультипроектности.

## Задача
Описать `ProjectConfig` как версионируемый документ данных и правила разрешения
`defaults ← instance ← project ← agent ← run`.

## Объём
- `ProjectConfig`: `projectId`, `version`, `workflow` (лимиты шагов/ретраев/approvals),
  `tools` (writeMode, protectedPaths, allowedShellCommands, maxModifiedFiles),
  `budgets` (токены/деньги на прогон/задачу/сутки), `modelRoutingRef`, `agents`.
- Переиспользовать существующие enum'ы (`safeWriteMode`, `approvalRequestedAction`) из
  `packages/shared/src/config/runtime-config.ts` — вынести их в `core`, чтобы не дублировать.
- Функция `resolveEffectiveConfig(instance, project, agent?, run?)`.

## Критерии приёмки
- [ ] Схема строгая (`z.strictObject`), неизвестные ключи отклоняются — как в существующем конфиге.
- [ ] `resolveEffectiveConfig` детерминирована и чистая (без чтения env).
- [ ] Ошибка разрешения — `ConfigError` с перечнем проблем (формат как сейчас).

## Тесты
- Юнит: приоритеты слоёв; отсутствие слоя; конфликт значений; неизвестный ключ.

## Не входит
- Проверка неэскалации прав — отдельная задача 0103.
