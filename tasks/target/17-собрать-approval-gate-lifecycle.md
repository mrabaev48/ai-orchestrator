# Task 17 — Собрать approval-gate lifecycle

**Priority:** P1

## Цель
Добавить ApprovalRequest + API/UI-поток pending/approve/reject/resume для рискованных операций.

## Зона изменений
- packages/core/src/types.ts
- packages/execution/*
- apps/dashboard-api/src/modules/*

## Основные зависимости
- Human-in-the-loop controls

## Критерии готовности
- Risky actions требуют подтверждения; после approve run корректно возобновляется.
