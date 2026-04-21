# Task 01 — Исправить семантику runTask(taskId)

**Priority:** P0

## Цель
Гарантировать запуск именно запрошенной задачи через runSingleTask(taskId) с детерминированными ошибками для blocked/done/invalid состояний.

## Зона изменений
- packages/application/src/services/control-plane.service.ts
- packages/execution/src/orchestrator.ts

## Основные зависимости
- Селектор задач, runCycle, валидация переходов

## Критерии готовности
- runTask всегда исполняет ровно целевую задачу или возвращает объяснимую ошибку; тесты покрывают happy-path и edge-cases.
