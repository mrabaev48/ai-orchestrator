# 0105 — Порт ScopedStateStore

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0101
**Файлы:** `packages/state/src/ScopedStateStore.ts` (новый), `packages/state/src/index.ts`

## Контекст
`StateStore.load()` не принимает параметров (`packages/state/src/StateStore.ts:55`) — проект
неявно зашит в экземпляр стора. Это корневая причина однопроектности.

## Задача
Объявить порт `ScopedStateStore`, где каждая операция принимает `TenantScope`, а журнальные
записи добавляются отдельными методами (без перезаписи всего снимка).

## Объём
- Зеркалировать все методы `StateStore` с первым аргументом `scope: TenantScope`.
- Добавить `appendRunStep`, `appendArtifact`, `appendDecision`, `appendPolicyDecision`,
  `appendFailure` как самостоятельные операции.
- Добавить `listProjects(scope: { tenantId })` — понадобится планировщику.
- Только объявление типов: реализации в 0205/0206.

## Критерии приёмки
- [ ] Порт экспортируется из `@ai-orchestrator/state`.
- [ ] Ни один существующий потребитель не сломан (`StateStore` остаётся как есть).
- [ ] `pnpm run boundaries` зелёный.

## Тесты
- Компиляционный тест: фиктивная реализация порта типизируется.

## Не входит
- Реализации адаптеров, миграции.
