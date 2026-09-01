# 1507 — Адаптер вызова MCP-инструмента в реестре

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1506
**Файлы:** `packages/capabilities/src/mcp/mcp-tool-adapter.ts`

## Задача
Исполнение `mcp:*` инструментов через единый путь `ToolRegistry.execute`, с теми же гейтами,
dedup и evidence, что у локальных.

## Объём
- `client.callTool({ name, arguments })` → нормализация `content` в `UnifiedToolResult`.
- `result.isError === true` → `ToolErrorEnvelope{category:'execution', retriable:false}`.
- Таймаут вызова из регистрации; отмена по `AbortSignal`.
- Идемпотентность: для инструментов с внешними side-effects строится ключ идемпотентности
  (существующий `build-idempotency-key`) и используется dedup-registry.

## Критерии приёмки
- [ ] Вызов MCP-инструмента даёт запись в run-step-log в том же формате, что локальный.
- [ ] Ошибка сервера не приводит к падению прогона — она нормализована и обработана политикой.
- [ ] Повторный вызов после ретрая не дублирует внешний side-effect.

## Тесты
- Интеграция: успешный вызов, ошибка инструмента, таймаут, ретрай с dedup.
