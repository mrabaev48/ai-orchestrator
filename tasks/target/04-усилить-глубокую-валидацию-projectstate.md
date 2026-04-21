# Task 04 — Усилить глубокую валидацию ProjectState

**Priority:** P0

## Цель
Покрыть Zod-схемами все вложенные сущности (Epic/Feature/BacklogTask/Milestone/Decision/Failure/Artifact) и валидацию snapshot save.

## Зона изменений
- packages/state/src/ports/state-validator.ts
- packages/core/src/types.ts

## Основные зависимости
- Сериализация state, миграции

## Критерии готовности
- Некорректные snapshot/state отклоняются с actionable ошибкой; есть migration-тесты.
