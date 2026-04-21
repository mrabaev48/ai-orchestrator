# Task 21 — Реализовать recovery: DLQ + resume/replay

**Priority:** P2

## Цель
Добавить state-machine для job failure, dead-letter и команды возобновления с checkpoint.

## Зона изменений
- packages/execution/*
- packages/state/*
- apps/control-plane/*

## Основные зависимости
- Reliability

## Критерии готовности
- Сбойные run не теряются, а восстанавливаются из контрольной точки.
