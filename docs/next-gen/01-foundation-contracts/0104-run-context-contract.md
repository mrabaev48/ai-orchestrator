# 0104 — Контракт RunContext

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0101, 0102
**Файлы:** `packages/core/src/run-context.ts` (новый)

## Контекст
`Orchestrator` сегодня сам достаёт всё нужное из процесс-глобального `RuntimeConfig` и
единственного `StateStore`. Для мультипроектности ядро должно получать уже разрешённый
контекст прогона, а не выяснять «какой это проект».

## Задача
Ввести `RunContext` — иммутабельный объект, полностью описывающий один прогон.

## Контракт
```ts
export interface RunContext {
  readonly runId: string;
  readonly scope: TenantScope;              // tenantId + projectId
  readonly repositoryId: string;
  readonly agentRef?: string;               // agentId@version, заполняется с 1612
  readonly effectiveConfig: EffectiveConfig;
  readonly correlationId: string;
  readonly traceId: string;
  readonly startedAt: string;
}
```

## Критерии приёмки
- [ ] Тип экспортирован, все поля `readonly`.
- [ ] Есть фабрика `createRunContext(...)` с валидацией скоупа.
- [ ] Существующий код не изменён (тип пока не используется).

## Тесты
- Юнит: фабрика отклоняет невалидный скоуп; `traceId`/`correlationId` генерируются, если не заданы.

## Не входит
- Проброс `RunContext` в `Orchestrator` — задача 0701.
