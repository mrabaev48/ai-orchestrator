# Task 14 — Интегрировать build/lint/typecheck/test стадии

**Priority:** P1

## Цель
Добавить пост-изменений pipeline проверки качества и сохранить диагностические артефакты в state/evidence.

## Зона изменений
- packages/execution/*
- packages/tools/src/testing/*
- packages/tools/src/typescript/*

## Основные зависимости
- Validation gates

## Критерии готовности
- Задача не может быть завершена при failing quality-gates без explicit policy override.
