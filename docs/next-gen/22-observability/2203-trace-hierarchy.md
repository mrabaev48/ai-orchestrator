# 2203 — Иерархия трейсов прогона

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 2201
**Файлы:** `packages/execution/src/telemetry.ts`, `packages/llm/src/transport/http.ts`

## Иерархия
```
run (span)
└── task
    └── role step
        ├── llm call (provider, model, tokens, cost)
        └── tool call (tool, risk class, duration)
```

## Критерии приёмки
- [ ] `traceId` из evidence совпадает с `traceId` в OTel — трейс и журнал сходятся.
- [ ] Контекст трассировки корректно пробрасывается через async-границы (`AsyncLocalStorage` уже используется для лизы).
- [ ] Ошибки помечают спан статусом `error` с нормализованным кодом.

## Тесты
- Интеграция: полный прогон → корректное дерево спанов у фиктивного приёмника.
