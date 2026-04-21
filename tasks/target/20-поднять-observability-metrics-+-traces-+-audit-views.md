# Task 20 — Поднять observability: metrics + traces + audit views

**Priority:** P2

## Цель
Добавить telemetry по run/task/tool/token/cost + трассировку span-ов и удобный аудит-представление.

## Зона изменений
- packages/execution/*
- apps/dashboard-api/*
- apps/control-plane/*

## Основные зависимости
- Operations observability

## Критерии готовности
- SRE и операторы видят производительность, сбои и стоимость без ручного дебага.
