# Task 05 — Закрыть базовые пробелы API-безопасности

**Priority:** P0

## Цель
Включить auth (API key/JWT), RBAC и убрать permissive CORS для управляющих endpoint-ов.

## Зона изменений
- apps/dashboard-api/src/main.ts
- apps/dashboard-api/src/modules/*

## Основные зависимости
- Dashboard API, execution endpoints

## Критерии готовности
- Неавторизованные запросы к control endpoint-ам запрещены; роли ограничивают действия.
