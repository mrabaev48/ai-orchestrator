# 0302 — ProviderRegistration и ModelDescriptor

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0301
**Файлы:** `packages/llm/src/registry/descriptors.ts` (новый)

## Задача
Описать провайдера и модель как данные, включая матрицу возможностей и цену.

## Контракт
```ts
export type ProviderKind =
  | 'openai' | 'anthropic' | 'google' | 'azure-openai' | 'bedrock'
  | 'openai-compatible' | 'ollama' | 'mock';

export interface ProviderRegistration {
  readonly providerId: string; readonly tenantId: string; readonly kind: ProviderKind;
  readonly baseUrl?: string; readonly credentialRef?: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly egressClass: 'public' | 'private';
  readonly maxConcurrentRequests?: number;
  readonly enabled: boolean;
}

export interface ModelCapabilities {
  readonly structuredOutput: 'native_schema' | 'tool_call' | 'grammar' | 'json_mode' | 'none';
  readonly toolCalling: boolean; readonly streaming: boolean;
  readonly vision: boolean; readonly promptCaching: boolean;
}

export interface ModelDescriptor {
  readonly modelId: string; readonly providerId: string;
  readonly contextWindow: number; readonly maxOutputTokens: number;
  readonly capabilities: ModelCapabilities;
  readonly cost: { readonly inputPer1kUsdMicro: number; readonly outputPer1kUsdMicro: number;
                   readonly cachedReadPer1kUsdMicro?: number; readonly cacheWritePer1kUsdMicro?: number };
}
```

## Критерии приёмки
- [ ] `egressClass: 'private'` однозначно помечает локальные/внутрисетевые провайдеры —
      на этом строится offline-профиль (2604).
- [ ] Цена кэшированных токенов отделена от базовой (Anthropic: чтение кэша ~0.1x, запись 1.25x/2x).
- [ ] Схема zod + валидация `baseUrl` для kind, требующих адрес.

## Тесты
- Юнит: `openai-compatible` и `ollama` без `baseUrl` отклоняются; `mock` не требует кредов.
