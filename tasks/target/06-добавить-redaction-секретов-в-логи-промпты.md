# Task 06 — Добавить redaction секретов в логи/промпты

**Priority:** P0

## Цель
Ввести централизованное маскирование секретов, запрет утечек env/provider keys в logs/artifacts/prompts.

## Зона изменений
- packages/shared/*
- packages/llm/*
- packages/execution/*

## Основные зависимости
- Логирование, prompt building, artifacts

## Критерии готовности
- Секреты не попадают в telemetry и export; redaction покрыт тестами.
