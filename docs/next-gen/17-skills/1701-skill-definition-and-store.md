# 1701 — Модель Skill и хранилище

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1502
**Файлы:** `packages/core/src/capabilities/skill.ts`, `packages/state/src/capabilities/skill.store.ts`

## Контекст
Рабочий образец лежит внутри самого репозитория: `.agents/skills/*/SKILL.md` и `skills-lock.json`
с хешами источников. Продукту нужна та же механика.

## Контракт
```ts
export interface SkillDefinition {
  readonly skillId: string; readonly version: string;
  readonly name: string; readonly description: string;      // только это попадает в контекст
  readonly triggers: readonly string[];
  readonly body: string;                                     // подгружается по требованию
  readonly resources: readonly SkillResource[];
  readonly source: { readonly kind: 'inline' | 'git' | 'registry';
                     readonly ref?: string; readonly checksum: string };
}
```

## Критерии приёмки
- [ ] `description` ограничен по длине — это бюджет контекста, а не документация.
- [ ] Хранилище версионирует скиллы; активная версия выбирается привязкой (1705).

## Тесты
- Юнит на схему; контрактный набор для хранилища.
