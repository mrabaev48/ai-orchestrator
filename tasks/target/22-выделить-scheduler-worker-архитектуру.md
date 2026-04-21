# Task 22 — Выделить scheduler/worker архитектуру

**Priority:** P2

## Цель
Разделить API plane и worker plane, чтобы исключить прямое тяжелое выполнение в API процессе.

## Зона изменений
- apps/dashboard-api/*
- apps/worker-cli/*
- packages/application/*

## Основные зависимости
- Scalability

## Критерии готовности
- Нагрузка масштабируется горизонтально, а API остается отзывчивым.
