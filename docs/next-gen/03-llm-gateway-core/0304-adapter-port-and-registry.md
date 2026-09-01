# 0304 — Порт ModelProviderAdapter и реестр провайдеров

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0302, 0303
**Файлы:** `packages/llm/src/registry/provider-registry.ts`, `packages/llm/src/adapters/port.ts`

## Задача
Ввести порт адаптера и реестр, который держит несколько активных провайдеров одновременно
(в этом суть требования «несколько LLM от разных провайдеров»).

## Контракт
```ts
export interface ModelProviderAdapter {
  readonly kind: ProviderKind;
  listModels: (reg: ProviderRegistration) => Promise<readonly ModelDescriptor[]>;
  chat: <T>(reg: ProviderRegistration, model: ModelDescriptor, req: ChatRequest) => Promise<ChatResponse<T>>;
  health: (reg: ProviderRegistration) => Promise<ProviderHealth>;
}

export interface ProviderRegistry {
  register: (adapter: ModelProviderAdapter) => void;
  upsertProvider: (reg: ProviderRegistration) => void;
  resolve: (modelRef: string) => { reg: ProviderRegistration; model: ModelDescriptor; adapter: ModelProviderAdapter };
  listModels: (scope: TenantScope) => readonly ModelDescriptor[];
}
```
`modelRef` — строка вида `providerId/modelId`.

## Критерии приёмки
- [ ] Реестр допускает два провайдера одного kind (например, два хоста Ollama).
- [ ] Неизвестный `modelRef` даёт понятную ошибку со списком доступных.
- [ ] Реестр не хранит секреты — только `credentialRef`.

## Тесты
- Юнит: два `openai-compatible` с разными `baseUrl`; разрешение `modelRef`; отключённый провайдер.
