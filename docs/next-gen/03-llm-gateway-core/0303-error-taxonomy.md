# 0303 — Таксономия ошибок LLM и нормализация

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0301
**Файлы:** `packages/llm/src/errors.ts`

## Контекст
Сейчас всё сводится к одному `LlmProviderError` (`packages/llm/src/index.ts:22`), поэтому
ретрай-политика не может отличить «нет квоты» от «неверный ключ» и от «превышен контекст».

## Задача
Ввести классификацию ошибок и функцию нормализации HTTP-ответа провайдера в неё.

## Контракт
```ts
export type LlmErrorKind =
  | 'auth' | 'rate_limit' | 'quota' | 'context_overflow' | 'content_filter'
  | 'timeout' | 'cancelled' | 'server' | 'network' | 'schema' | 'unsupported';

export interface LlmErrorEnvelope {
  readonly kind: LlmErrorKind; readonly retriable: boolean;
  readonly providerId: string; readonly modelId?: string;
  readonly httpStatus?: number; readonly retryAfterMs?: number;
  readonly message: string; readonly details?: Record<string, unknown>;
}
```
Правила: retriable — `rate_limit`, `server`, `network`, `timeout`;
не retriable — `auth`, `quota`, `content_filter`, `unsupported`, `schema` (лечится repair-проходом),
`context_overflow` (лечится урезанием контекста, не повтором).

## Критерии приёмки
- [ ] `LlmProviderError` сохраняет обратную совместимость и несёт `envelope`.
- [ ] `Retry-After` из заголовка попадает в `retryAfterMs`.
- [ ] Тело ответа обрезается до 1000 символов и проходит через `redactSecrets`.

## Тесты
- Юнит-матрица: 401/403/429/500/503/таймаут/обрыв сети/невалидный JSON → ожидаемый kind.
