# Task 07 — Стабилизировать runtime-config и bootstrap-проверки

**Priority:** P0

## Цель
Ужесточить валидацию runtime-конфига (лимиты, policy, пути записи) до любых side effects.

## Зона изменений
- packages/shared/*
- packages/application/src/runtime-factory.ts

## Основные зависимости
- Инициализация приложения

## Критерии готовности
- Невалидный конфиг завершает bootstrap до запуска оркестратора.
