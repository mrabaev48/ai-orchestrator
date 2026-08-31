/**
 * A minimal in-process, per-key async mutex: concurrent calls to
 * `runExclusive` with the same key are queued FIFO so at most one runs at a
 * time; calls with different keys never block each other. Intended for
 * serializing local filesystem/subprocess side effects scoped by a resource
 * key (e.g. a repository root), not for cross-process coordination — see
 * `@ai-orchestrator/state`'s `DistributedLockStore` for that.
 */
export interface KeyedAsyncMutex {
  readonly runExclusive: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
}

export function createKeyedAsyncMutex(): KeyedAsyncMutex {
  const tails = new Map<string, Promise<void>>();

  return {
    runExclusive: async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
      const previous = tails.get(key) ?? Promise.resolve();

      let release!: () => void;
      const ownGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ownTail = previous.then(async () => ownGate, async () => ownGate);
      tails.set(key, ownTail);

      await previous.catch(() => {});

      try {
        return await fn();
      } finally {
        release();
        if (tails.get(key) === ownTail) {
          tails.delete(key);
        }
      }
    },
  };
}
