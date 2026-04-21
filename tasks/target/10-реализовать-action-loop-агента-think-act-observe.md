# Task 10 — Реализовать action-loop агента (think-act-observe)

**Priority:** P1

## Цель
Перевести роли на цикл tool_request/final_output с ограничением по шагам, таймаутам и журналированием наблюдений.

## Зона изменений
- packages/agents/src/base-agent.ts
- packages/execution/src/orchestrator.ts

## Основные зависимости
- Role execution protocol

## Критерии готовности
- Coder/Reviewer/Tester работают итеративно через инструменты; цикл завершается детерминированно.
