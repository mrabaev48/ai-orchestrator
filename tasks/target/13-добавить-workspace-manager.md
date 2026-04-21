# Task 13 — Добавить workspace manager

**Priority:** P1

## Цель
Запускать execution в изолированном git worktree/workspace с cleanup, rollback и фиксацией начального diff.

## Зона изменений
- packages/execution/*
- packages/tools/src/git/*

## Основные зависимости
- Repo mutation safety

## Критерии готовности
- Каждый run имеет изолированное рабочее пространство и контролируемый жизненный цикл.
