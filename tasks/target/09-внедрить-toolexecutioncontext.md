# Task 09 — Внедрить ToolExecutionContext

**Priority:** P1

## Цель
Ввести capability-объект на run/task с policy, permission scope, workspace и источником evidence.

## Зона изменений
- packages/execution/*
- packages/tools/*
- packages/agents/*

## Основные зависимости
- Orchestrator runtime, tool permissions

## Критерии готовности
- Каждой роли доступны только разрешенные инструменты в рамках контекста выполнения.
