# 1201 — Открытие закрытого union ToolCallName

**Фаза:** P2 · **Оценка:** M · **Зависит от:** —
**Файлы:** `packages/core/src/roles.ts`, потребители `ToolCallName`

## Контекст
`ToolCallName` — закрытый union из 13 значений (`packages/core/src/roles.ts:82`).
Пока он закрыт, ни MCP, ни HTTP-инструменты подключить нельзя.

## Задача
Механическая правка без изменения поведения: `ToolCallName` → `string` (или брендированный тип),
все `Record<ToolCallName, …>` → `Map`/`Record<string, …>` с явной обработкой отсутствия.

## Объём
- `TOOL_METADATA` в `packages/tools/src/index.ts:45` → реестр с методом `get(name)` и понятной
  ошибкой `unsupported` для неизвестного инструмента (уже есть категория ошибки).
- Сохранить константу `BUILTIN_TOOL_NAMES` для проверок и документации.

## Критерии приёмки
- [ ] Ни один существующий тест не изменил ожидания.
- [ ] Неизвестное имя инструмента даёт `ToolErrorEnvelope{category:'unsupported'}`, а не падение типов.
- [ ] Отдельный коммит, не смешанный с функциональными изменениями.

## Тесты
- Регрессия `tests/tools-adapters.test.ts`, `tests/tool-error-normalization.test.ts`.
