# 1001 — Контракт политики планировщика

**Фаза:** P1 · **Оценка:** S · **Зависит от:** 0802
**Файлы:** `packages/core/src/scheduling/scheduler-policy.ts`

## Контракт
```ts
export interface SchedulerPolicy {
  readonly maxConcurrentRunsPerInstance: number;
  readonly maxConcurrentRunsPerProject: number;
  readonly maxConcurrentMutationsPerRepository: number;   // как правило 1
  readonly fairness: 'weighted-round-robin';
  readonly projectWeights: Readonly<Record<string, number>>;
  readonly priorityBands: readonly { readonly name: string; readonly priority: number }[];
}
export type SchedulingBlockReason =
  | 'budget_exhausted' | 'project_paused' | 'resource_busy'
  | 'awaiting_approval' | 'concurrency_limit' | 'no_executable_task' | 'kill_switch';
```

## Критерии приёмки
- [ ] Все причины блокировки перечислены явно (это основа диагностики «почему стоим», 2206).
- [ ] Схема zod, значения по умолчанию безопасны (concurrency 1).

## Тесты
- Юнит на валидацию политики.
