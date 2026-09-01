# 0601 — Контракт политики маршрутизации моделей

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0302
**Файлы:** `packages/core/src/model-routing.ts`

## Контекст
Сегодня `LLM_ROLE_MODELS` резолвится в `role-runner.ts:224`, но влияет только на теги метрик:
фактический клиент создан один раз с `config.llm.model` (`packages/runtime/src/index.ts:84`).
Конфиг обещает то, чего рантайм не делает.

## Контракт
```ts
export interface ModelRoutingRule {
  readonly ruleId: string;
  readonly when: { readonly agentId?: string; readonly roleKey?: string;
                   readonly stage?: 'plan' | 'implement' | 'review' | 'test' | 'docs';
                   readonly complexity?: 'low' | 'medium' | 'high' };
  readonly candidates: readonly string[];            // ['ollama-local/qwen…', 'openai-main/…']
  readonly constraints?: { readonly egressClass?: 'private';
                           readonly minContextWindow?: number;
                           readonly requiresToolCalling?: boolean;
                           readonly requiresStructuredOutput?: boolean;
                           readonly maxCostPer1kUsdMicro?: number };
}
```

## Критерии приёмки
- [ ] Правила упорядочены и детерминированно разрешаются (первое подходящее).
- [ ] Пустой список кандидатов после фильтрации — явная ошибка с перечнем причин отсева.
- [ ] Схема zod + экспорт из `core`.

## Тесты
- Юнит: приоритеты правил, фильтрация по каждому ограничению.
