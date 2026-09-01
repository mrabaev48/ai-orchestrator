# 0401 — Адаптер OpenAI Responses

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0304, 0307
**Файлы:** `packages/llm/src/adapters/openai.ts`

## Контекст
Текущая реализация (`packages/llm/src/index.ts:62-91`) уже ходит в `/v1/responses` со
структурированным выводом, но не читает usage, не поддерживает инструменты и отказы.

## Задача
Полноценный адаптер под новый порт.

## Объём
- Запрос: `model`, `input` (из `messages`), `tools`, `tool_choice`,
  `text.format = { type: 'json_schema', name, schema, strict: true }`, `temperature`, `max_output_tokens`.
- Ответ: `output_text` / обход `output[].content[]` (сохранить текущую логику как fallback),
  `tool_calls`, `usage.input_tokens|output_tokens|total_tokens`, `output_tokens_details`.
- Распознавание блока `refusal` → `finishReason: 'refusal'`.
- `capabilities`: `native_schema`, tool calling, streaming, prompt caching.

## Документация
- Structured Outputs: параметр `text.format` (Responses) / `response_format` (Chat Completions);
  требования strict-схемы: все поля в `required`, `additionalProperties: false`.
- Usage сообщается в объекте `usage`.

## Критерии приёмки
- [ ] Фикстурные ответы разбираются в `ChatResponse` без потери usage.
- [ ] Ошибки маппятся в таксономию 0303.
- [ ] Обратная совместимость: старый путь `generateObject` даёт тот же результат.

## Тесты
- Юнит на фикстурах: обычный ответ, tool_call, refusal, ошибка 429.
