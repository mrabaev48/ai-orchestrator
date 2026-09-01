# 0402 — Универсальный адаптер OpenAI-compatible (vLLM, LM Studio, llama.cpp, OpenRouter)

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0304, 0307
**Файлы:** `packages/llm/src/adapters/openai-compatible.ts`

## Контекст
Один протокол `/v1/chat/completions` закрывает большинство локальных и агрегирующих стеков —
это самый дешёвый способ выполнить требование «локальные LLM».

## Объём
- `POST {baseUrl}/v1/chat/completions`: `model`, `messages`, `tools`, `tool_choice`,
  `response_format`, `temperature`, `max_tokens`, `stream: false`.
- Дискавери моделей: `GET {baseUrl}/v1/models`.
- Структурированный вывод:
  - `response_format: { type: 'json_schema', json_schema: { name, schema } }` (vLLM, LM Studio);
  - грамматика через `extra_body.structured_outputs.grammar` (vLLM ≥0.12) —
    устаревшие `guided_json` / `guided_grammar` не использовать;
  - для llama.cpp server — GBNF-грамматика по его собственному полю.
- Usage: `usage.prompt_tokens` / `completion_tokens` → нормализовать в `TokenUsage`.
- Ключ API опционален (локальные серверы часто без авторизации).

## Документация
- vLLM structured outputs: `response_format` с `json_schema`; `extra_body.structured_outputs`
  с `choice` / `regex` / `json` / `grammar` / `structural_tag`; `guided_*` удалены в 0.12.

## Критерии приёмки
- [ ] Работает без `apiKey`, если провайдер зарегистрирован без `credentialRef`.
- [ ] Отсутствие usage в ответе → `estimated: true`, а не нули.
- [ ] Поддержка кастомного `defaultHeaders` (нужно для OpenRouter).

## Тесты
- Фикстуры vLLM / LM Studio / OpenRouter; ответ без usage; ответ с tool_calls.
