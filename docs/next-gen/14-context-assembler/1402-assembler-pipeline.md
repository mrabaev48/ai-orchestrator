# 1402 — Пайплайн сборки контекста

**Фаза:** P2 · **Оценка:** L · **Зависит от:** 1401
**Файлы:** `packages/capabilities/src/context/assembler.ts`

## Контракт
Сборщик не знает про конкретные источники блоков: скиллы (1703) и правила (1803)
подключаются позже как реализации порта `ContextBlockProvider` — поэтому эта задача
идёт до них и не зависит от них.

```ts
export interface ContextBlockProvider {
  readonly slot: ContextSlot;                 // позиция в порядке ниже
  provide: (input: ContextInput, budget: number) => Promise<readonly ContentPart[]>;
}
```

```ts
export interface ContextAssembler {
  assemble: (input: {
    readonly agent: AgentDefinition;
    readonly runContext: RunContext;
    readonly stateSummary: string;
    readonly observations: readonly RoleObservation[];
    readonly model: ModelDescriptor;
    readonly budget: { readonly maxInputTokens: number };
  }) => Promise<readonly ChatMessage[]>;
}
```

## Порядок блоков
1. Системные инструкции агента + enforced-правила (не вытесняются никогда).
2. Задача и критерии приёмки.
3. Guidance-правила по релевантности — через провайдер, подключается в 1803.
4. Каталог скиллов (описания) — через провайдер, подключается в 1703.
5. Сводка состояния проекта.
6. Последние N наблюдений полностью.
7. Ранние наблюдения в сжатом виде.
8. Память проекта по релевантности (после 2704).

## Критерии приёмки
- [ ] Блоки 1–2 присутствуют всегда, даже при жёстком дефиците бюджета.
- [ ] Сборка детерминирована для одинакового входа.
- [ ] Блоки 1–3 маркируются как стабильный префикс для кэширования.
- [ ] Отсутствие провайдера для слота не ломает сборку — слот просто пуст.

## Тесты
- Юнит: соблюдение бюджета, порядок, детерминизм, неудаляемость системных блоков.
