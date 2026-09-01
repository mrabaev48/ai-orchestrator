# 1609 — Seed 12 встроенных ролей как определений

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1604, 1602
**Файлы:** `packages/agents/src/builtin/definitions/*.yaml`, `packages/application/src/agents/seed.ts`

## Задача
Описать существующие роли (`bootstrap_analyst`, `architect`, `planner`, `release_auditor`,
`state_steward`, `integration_manager`, `task_manager`, `prompt_engineer`, `coder`, `reviewer`,
`tester`, `docs_writer`) как `AgentDefinition` с `kind: 'builtin'`.

## Объём
- Инструкции берутся из существующих шаблонов (`packages/prompts/src/prompt-pipeline.ts:16-29`)
  и промптов ролей.
- Выходные схемы — из `role-output-schema-registry`.
- Идемпотентный seed при старте: не перетирает пользовательские правки, добавляет новую версию.

## Критерии приёмки
- [ ] После seed все 12 ролей доступны как определения и редактируемы (промпт, модель).
- [ ] Существующие прогоны продолжают использовать TS-реализации до 1610.

## Тесты
- Интеграция: повторный seed не создаёт дублей; правка builtin создаёт новую версию.
