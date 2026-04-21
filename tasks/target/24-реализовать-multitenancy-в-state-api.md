# Task 24 — Реализовать multitenancy в state/API

**Priority:** P3

## Цель
Добавить org/project scope во все сущности, индексы и проверку tenancy boundaries в API.

## Зона изменений
- packages/core/src/types.ts
- packages/state/*
- apps/dashboard-api/*

## Основные зависимости
- SaaS readiness

## Критерии готовности
- Данные разных клиентов полностью изолированы на уровне модели и запросов.
