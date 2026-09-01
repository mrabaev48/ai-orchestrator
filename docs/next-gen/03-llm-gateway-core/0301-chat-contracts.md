# 0301 — Контракты чата: сообщения, инструменты, usage

**Фаза:** P0 · **Оценка:** M · **Зависит от:** —
**Файлы:** `packages/llm/src/contracts.ts` (новый)

## Контекст
Текущий интерфейс — единственный метод `generateObject` со строковым промптом
(`packages/llm/src/index.ts:7-9`). Нет сообщений, инструментов, usage, причины остановки.
Это блокирует и tool-calling, и prompt caching, и честный учёт стоимости.

## Задача
Описать провайдеро-независимые контракты запроса/ответа чата.

## Контракт
```ts
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: readonly ContentPart[];
  readonly toolCallId?: string;
  readonly cacheHint?: 'stable_prefix';
}
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;   // JSON Schema
  readonly strict?: boolean;
}
export interface ChatRequest {
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ToolSpec[];
  readonly toolChoice?: 'auto' | 'required' | 'none' | { readonly name: string };
  readonly responseSchema?: { readonly name: string; readonly schema: Record<string, unknown> };
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedReadTokens?: number;
  readonly cacheWriteTokens?: number;
  readonly estimated: boolean;
}
export interface ChatResponse<TOutput = unknown> {
  readonly providerId: string; readonly modelId: string;
  readonly text?: string; readonly parsed?: TOutput;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage;
  readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'refusal' | 'content_filter' | 'error';
  readonly latencyMs: number;
}
```

## Документация
- OpenAI Responses: `text.format = { type: 'json_schema', name, schema, strict }`, usage:
  `input_tokens` / `output_tokens` / `total_tokens`, поле `refusal` при отказе.
- Anthropic Messages: `tools[].input_schema`, блоки `tool_use` / `tool_result`,
  `stop_reason: 'tool_use'`, usage: `cache_creation_input_tokens` / `cache_read_input_tokens`.
- Ollama `/api/chat`: `message.tool_calls`, `done_reason`, `prompt_eval_count`, `eval_count`.

## Критерии приёмки
- [ ] Контракты покрывают все три семейства провайдеров без provider-специфичных полей.
- [ ] `cacheWriteTokens`/`cachedReadTokens` отделены — это разные цены.
- [ ] `estimated` обязателен: потребитель всегда знает, факт это или оценка.

## Тесты
- Компиляционные + сериализация фикстур ответов трёх провайдеров в общий тип (в 04xx).
