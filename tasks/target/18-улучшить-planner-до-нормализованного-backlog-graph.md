# Task 18 — Улучшить planner до нормализованного backlog graph

**Priority:** P1

## Цель
Планировщик должен выдавать milestones/epics/features/tasks + dependencyEdges, risks, assumptions с merge-preview.

## Зона изменений
- packages/agents/src/roles/planner*
- packages/core/src/types.ts

## Основные зависимости
- Planning quality

## Критерии готовности
- Planner output детерминирован и может быть безопасно применен/отклонен пользователем.
