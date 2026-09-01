# 0901 — Модель ресурсных ключей

**Фаза:** P1 · **Оценка:** S · **Зависит от:** 0101
**Файлы:** `packages/core/src/resources/resource-key.ts`

## Контекст
Сейчас прогон берёт лизу на `'global-run-cycle'`, отскоупленную проектом
(`packages/execution/src/orchestrator.ts:155`). Это сериализует весь проект целиком, хотя
конфликтуют лишь конкретные ресурсы.

## Контракт
```ts
export type ResourceKey =
  | `repo:${string}`                      // admin-операции git (worktree add/prune)
  | `repo:${string}:branch:${string}`      // мутации конкретной базовой ветки
  | `project:${string}:plan`               // изменение backlog/плана
  | `external:${string}`;                  // внешний сервис с квотой

export interface ResourceClaim {
  readonly keys: readonly ResourceKey[];
  readonly mode: 'exclusive' | 'shared';
}
```

## Критерии приёмки
- [ ] Формат ключа валидируется; компоненты не содержат `:`.
- [ ] Ключи детерминированы и стабильны между процессами.

## Тесты
- Юнит: построение и парсинг ключей; отказ на недопустимых компонентах.
