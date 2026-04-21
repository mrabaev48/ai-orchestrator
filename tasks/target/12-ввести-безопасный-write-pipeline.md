# Task 12 — Ввести безопасный write pipeline

**Priority:** P1

## Цель
Добавить режимы read-only/propose/sandbox/workspace/protected-write и централизованные guardrail-проверки.

## Зона изменений
- packages/tools/*
- packages/execution/*

## Основные зависимости
- FS writes, approval hooks

## Критерии готовности
- Опасные операции блокируются/маркируются на approval; все записи атрибутированы task/run/role.
