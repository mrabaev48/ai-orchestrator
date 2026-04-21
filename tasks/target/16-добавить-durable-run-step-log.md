# Task 16 — Добавить durable run-step log

**Priority:** P1

## Цель
Сохранить каждый шаг выполнения (role/tool/input/output/status/duration) в персистентный журнал для replay/analytics.

## Зона изменений
- packages/state/src/entities/*
- packages/state/src/repositories/*
- packages/execution/*

## Основные зависимости
- Observability data model

## Критерии готовности
- История run воспроизводима постфактум и доступна API/UI.
