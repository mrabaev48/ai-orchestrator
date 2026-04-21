# Task 02 — Устранить дедлок при split задач

**Priority:** P0

## Цель
Переписать модель split: родитель переводится в superseded/split, подзадачи наследуют зависимости родителя без циклической блокировки.

## Зона изменений
- packages/agents/src/roles/task-router.ts
- packages/execution/src/orchestrator.ts
- packages/core/src/types.ts

## Основные зависимости
- Task lineage, dependency graph

## Критерии готовности
- После split все подзадачи исполнимы, DAG валиден, добавлены тесты на 1/N подзадач.
