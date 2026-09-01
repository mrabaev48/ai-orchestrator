# 1801 — Контракт Rule и скоупы

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1502
**Файлы:** `packages/core/src/capabilities/rule.ts`

## Контекст
Правило, которое живёт только в тексте промпта, — не гарантия. Поэтому правила делятся на два
класса: рекомендации для модели и детерминированно проверяемые ограничения.

## Контракт
```ts
export interface Rule {
  readonly ruleId: string;
  readonly scope: { readonly level: 'org' | 'project' | 'agent' | 'path'; readonly selector?: string };
  readonly priority: number;
  readonly kind: 'guidance' | 'enforced';
  readonly severity: 'info' | 'warn' | 'block';
  readonly text: string;
  readonly predicate?: RulePredicate;
  readonly enabled: boolean;
}
export type RulePredicate =
  | { readonly type: 'forbid_path_write'; readonly globs: readonly string[] }
  | { readonly type: 'require_approval_for'; readonly actions: readonly ApprovalRequestedAction[] }
  | { readonly type: 'max_changed_files'; readonly value: number }
  | { readonly type: 'require_tests_for_paths'; readonly globs: readonly string[] }
  | { readonly type: 'forbid_tool'; readonly tools: readonly string[] }
  | { readonly type: 'forbid_dependency_add' };
```

## Критерии приёмки
- [ ] `kind: 'enforced'` без `predicate` отклоняется схемой.
- [ ] `scope.level: 'path'` требует `selector` (glob).
- [ ] Набор предикатов закрыт и расширяется осознанно (новый предикат = новая задача).

## Тесты
- Юнит на схему и на каждый вариант предиката.
