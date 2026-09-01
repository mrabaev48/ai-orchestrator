# 0802 — Порт и контракты очереди прогонов

**Фаза:** P1 · **Оценка:** S · **Зависит от:** 0801
**Файлы:** `packages/state/src/queue/run-queue.store.ts`

## Контракт
```ts
export interface EnqueueRunCommand {
  readonly scope: TenantScope; readonly taskId?: string; readonly agentRef?: string;
  readonly priority?: number; readonly resourceKeys: readonly string[];
  readonly idempotencyKey: string; readonly availableAt?: string;
  readonly payload: Record<string, unknown>;
}
export interface RunQueueStore {
  enqueue: (cmd: EnqueueRunCommand) => Promise<{ enqueued: boolean; id: string }>;
  lease: (owner: string, ttlMs: number, filter?: QueueFilter) => Promise<LeasedRunItem | null>;
  heartbeat: (id: string, owner: string, ttlMs: number) => Promise<boolean>;
  complete: (id: string, owner: string, outcome: 'done' | 'failed', error?: unknown) => Promise<void>;
  requeue: (id: string, owner: string, delayMs: number) => Promise<void>;
  reapExpired: (nowIso: string) => Promise<number>;
  stats: (scope?: TenantScope) => Promise<QueueStats>;
}
```

## Критерии приёмки
- [ ] Повторный `enqueue` с тем же `idempotencyKey` возвращает `enqueued: false`, не создавая дубль.
- [ ] Все операции требуют `owner` — чужой воркер не может завершить чужую работу.

## Тесты
- Контрактный набор, общий для Postgres- и in-memory-реализаций.
