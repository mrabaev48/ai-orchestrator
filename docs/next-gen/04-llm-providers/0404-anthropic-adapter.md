# 0404 — Адаптер Anthropic Messages (tool use + prompt caching)

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0304, 0307
**Файлы:** `packages/llm/src/adapters/anthropic.ts`

## Контекст
Текущая реализация (`packages/llm/src/index.ts:93-124`) отправляет один пользовательский
блок и не читает usage; кэширование и инструменты не используются.

## Объём
- Запрос: `model`, `max_tokens`, `system` (отдельным полем, не сообщением), `messages`,
  `tools: [{ name, description, input_schema }]`, `tool_choice`, `temperature`.
- Ответ: контент-блоки `text` / `tool_use`; `stop_reason` (в т.ч. `tool_use`) → `finishReason`.
- Инструментальный цикл: результат инструмента отправляется блоком `tool_result`
  с `tool_use_id` и флагом `is_error` при неуспехе.
- Prompt caching: `cache_control: { type: 'ephemeral' }` (опционально `ttl: '1h'`) на стабильном
  префиксе; не более 4 явных брейкпоинтов; usage читается из
  `cache_creation_input_tokens` и `cache_read_input_tokens`.
- Строгие схемы инструментов (`strict: true`) там, где нужен гарантированный формат.

## Критерии приёмки
- [ ] `cacheWriteTokens` / `cachedReadTokens` заполняются и учитываются по своим ценам.
- [ ] Изменение набора инструментов инвалидирует кэш — в тестах зафиксировано как ожидаемое.
- [ ] Заголовок версии API конфигурируем, не захардкожен в трёх местах.

## Тесты
- Фикстуры: text-ответ, tool_use, tool_result-раунд, ответ с cache-usage.
