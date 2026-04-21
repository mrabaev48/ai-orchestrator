# Task 15 — Реализовать git lifecycle: branch/commit/pr-draft

**Priority:** P1

## Цель
Создать pipeline ветка->коммит->PR metadata с привязкой к taskId/runId и сохранением в artifacts.

## Зона изменений
- packages/tools/src/git/*
- packages/execution/*
- packages/core/src/types.ts

## Основные зависимости
- Delivery lifecycle

## Критерии готовности
- Изменения трассируются до коммита/PR и могут быть экспортированы в review bundle.
