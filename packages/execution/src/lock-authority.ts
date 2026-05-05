import { ConfigError, WorkflowPolicyError } from '../../shared/src/index.ts';
import type { RuntimeConfig } from '../../shared/src/index.ts';

export interface RunLockHandle {
  release: () => Promise<void>;
}

export interface LockAuthority {
  acquireRunLock: (key: string, scope?: { tenantId: string; projectId: string }) => Promise<RunLockHandle | null>;
}

interface PgPoolLike {
  connect: () => Promise<PgClientLike>;
}

interface PgClientLike {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
  release: () => void;
}

type PgModule = {
  Pool: new (options: { connectionString: string }) => PgPoolLike;
};

interface RedisLike {
  set: (key: string, value: string, options?: { NX?: boolean; PX?: number }) => Promise<unknown>;
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
}

interface RedisLockAuthorityOptions {
  loadClient?: (dsn: string) => Promise<RedisLike>;
}

interface EtcdLeaseLike {
  put: (key: string) => {
    value: (value: string, options?: { prevNoExist?: boolean }) => Promise<unknown>;
  };
  revoke: () => Promise<void>;
}

interface EtcdClientLike {
  lease: (ttlSeconds: number) => EtcdLeaseLike;
}

interface EtcdLockAuthorityOptions {
  loadClient?: (dsn: string) => Promise<EtcdClientLike>;
}

export function createLockAuthority(config: RuntimeConfig): LockAuthority {
  const runLockProvider = config.workflow.runLockProvider ?? 'noop';
  if (runLockProvider === 'noop') {
    return new NoopLockAuthority();
  }

  const dsn = config.workflow.runLockDsn;
  if (!dsn) {
    throw new ConfigError(
      `workflow.runLockDsn is required when workflow.runLockProvider=${runLockProvider}; set WORKFLOW_RUN_LOCK_DSN to a shared provider DSN`,
    );
  }

  switch (runLockProvider) {
    case 'postgresql':
      return new PostgresLockAuthority(dsn);
    case 'redis':
      return new RedisLockAuthority(dsn);
    case 'etcd':
      return new EtcdLockAuthority(dsn);
    default:
      throw new ConfigError(`Unsupported run lock provider: ${String(runLockProvider)}`);
  }
}

export class NoopLockAuthority implements LockAuthority {
  /**
   * Single-process fallback only.
   *
   * This authority never coordinates across workers and must not be used for
   * multi-worker execution.
   */
  async acquireRunLock(key: string, scope?: { tenantId: string; projectId: string }): Promise<RunLockHandle> {
    void key;
    void scope;
    return {
      release: async () => {},
    };
  }
}

export class PostgresLockAuthority implements LockAuthority {
  private readonly poolPromise: Promise<PgPoolLike>;
  private readonly dsn: string;

  constructor(dsn: string) {
    this.dsn = dsn;
    this.poolPromise = loadPostgresPool(dsn);
  }

  async acquireRunLock(key: string, scope?: { tenantId: string; projectId: string }): Promise<RunLockHandle | null> {
    const lockKey = `ai-orchestrator:run-lock:${formatScopedRunLockKey(key, scope)}`
    const pool = await this.poolPromise;
    const client = await pool.connect();
    try {
      const result = (await client.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
        [lockKey],
      )) as { rows: { locked: boolean }[] };

      if (!result.rows[0]?.locked) {
        client.release();
        return null;
      }

      return {
        release: async () => {
          await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
          client.release();
        },
      };
    } catch (error) {
      client.release();
      throw new WorkflowPolicyError('Unable to acquire PostgreSQL run lock', { cause: error });
    }
  }
}

export class RedisLockAuthority implements LockAuthority {
  private readonly clientPromise: Promise<RedisLike>;
  private readonly ttlMs = 60_000;
  private readonly dsn: string;

  constructor(dsn: string, options: RedisLockAuthorityOptions = {}) {
    this.dsn = dsn;
    this.clientPromise = (options.loadClient ?? loadRedisClient)(dsn);
  }

  async acquireRunLock(key: string, scope?: { tenantId: string; projectId: string }): Promise<RunLockHandle | null> {
    const lockKey = `ai-orchestrator:run-lock:${formatScopedRunLockKey(key, scope)}`
    const client = await this.clientPromise;
    const token = crypto.randomUUID();
    
    let acquired: unknown;
    try {
      acquired = await client.set(lockKey, token, { NX: true, PX: this.ttlMs });
    } catch (error) {
      throw new WorkflowPolicyError('Unable to acquire Redis run lock', {
        cause: error,
        details: {
          provider: 'redis',
          operation: 'acquire',
          key,
          dsn: this.dsn,
        },
      });
    }

    if (!isRedisLockAcquired(acquired)) {
      return null;
    }

    return {
      release: async () => {
        try {
          await client.eval(
            'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
            {
              keys: [lockKey],
              arguments: [token],
            },
          );
        } catch (error) {
          throw new WorkflowPolicyError('Unable to release Redis run lock', {
            cause: error,
            details: {
              provider: 'redis',
              operation: 'release',
              key,
              dsn: this.dsn,
            },
          });
        }
      },
    };
  }
}

export class EtcdLockAuthority implements LockAuthority {
  private readonly clientPromise: Promise<EtcdClientLike>;
  private readonly ttlSeconds = 60;
  private readonly dsn: string;

  constructor(dsn: string, options: EtcdLockAuthorityOptions = {}) {
    this.dsn = dsn;
    this.clientPromise = (options.loadClient ?? loadEtcdClient)(dsn);
  }

  async acquireRunLock(key: string, scope?: { tenantId: string; projectId: string }): Promise<RunLockHandle | null> {
    const lockKey = formatScopedRunLockKey(key, scope);
    const client = await this.clientPromise;
    const lease = client.lease(this.ttlSeconds);
    const value = crypto.randomUUID();

    try {
      await lease.put(`ai-orchestrator/run-lock/${lockKey}`).value(value, { prevNoExist: true });
    } catch (error) {
      await lease.revoke().catch(() => undefined);
      if (isEtcdLockContention(error)) {
        return null;
      }

      throw new WorkflowPolicyError('Unable to acquire etcd run lock', {
        cause: error,
        details: {
          provider: 'etcd',
          operation: 'acquire',
          key,
          dsn: this.dsn,
        },
      });
    }

    return {
      release: async () => {
        try {
          await lease.revoke();
        } catch (error) {
          throw new WorkflowPolicyError('Unable to release etcd run lock', {
            cause: error,
            details: {
              provider: 'etcd',
              operation: 'release',
              key,
              dsn: this.dsn,
            },
          });
        }
      },
    };
  }
}

async function loadPostgresPool(connectionString: string): Promise<PgPoolLike> {
  let module: PgModule;
  try {
    module = await import('pg');
  } catch (error) {
    throw new ConfigError(
      'PostgreSQL run lock provider requires `pg` package; install it or switch WORKFLOW_RUN_LOCK_PROVIDER',
      { cause: error },
    );
  }

  return new module.Pool({ connectionString });
}

async function loadRedisClient(dsn: string): Promise<RedisLike> {
  type RedisModule = {
    createClient: (options: { url: string }) => RedisLike & { connect: () => Promise<void> };
  };

  let module: RedisModule;
  try {
    module = await import('redis');
  } catch (error) {
    throw new ConfigError(
      'Redis run lock provider requires `redis` package; install it or switch WORKFLOW_RUN_LOCK_PROVIDER',
      { cause: error },
    );
  }

  const client = module.createClient({ url: dsn });
  await client.connect();
  return client;
}

async function loadEtcdClient(dsn: string): Promise<EtcdClientLike> {
  type EtcdModule = {
    Etcd3: new (options: { hosts: string }) => EtcdClientLike;
  };

  let module: EtcdModule;
  try {
    module = await import('etcd3');
  } catch (error) {
    throw new ConfigError(
      'Etcd run lock provider requires `etcd3` package; install it or switch WORKFLOW_RUN_LOCK_PROVIDER',
      { cause: error },
    );
  }

  return new module.Etcd3({ hosts: dsn });
}

function isRedisLockAcquired(result: unknown): boolean {
  return result === 'OK' || result === true;
}

function isEtcdLockContention(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('already exists') || message.includes('compare failed');
}

function formatScopedRunLockKey(key: string, scope?: { tenantId: string; projectId: string }): string {
  if (!scope) {
    return key;
  }

  return `${scope.tenantId}:${scope.projectId}:${key}`;
}
