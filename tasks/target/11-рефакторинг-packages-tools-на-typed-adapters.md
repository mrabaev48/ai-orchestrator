# Task 11 — Рефакторинг packages/tools на typed adapters

**Priority:** P1

## Цель
Разнести инструменты по адаптерам (filesystem/git/typescript/shell/testing/diff/search/policy/evidence) с единым контрактом.

## Зона изменений
- packages/tools/src/*

## Основные зависимости
- Tool subsystem

## Критерии готовности
- Каждый адаптер имеет контракт, unit-тесты, таймауты и стандартизированный результат.
