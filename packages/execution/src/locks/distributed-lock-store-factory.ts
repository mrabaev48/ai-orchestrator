import { ConfigError } from '../../../shared/src/index.ts';
import type { RuntimeConfig } from '../../../shared/src/index.ts';
import {
  InMemoryDistributedLockStore,
  type DistributedLockLease,
  type DistributedLockStore,
} from '../../../state/src/locks/distributed-lock.store.ts';

interface RedisLike {
  set: (key: string, value: string, options?: { NX?: boolean; PX?: number }) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  incr: (key: string) => Promise<number>;
  eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
}
interface PgPoolLike { connect: () => Promise<PgClientLike>; }
interface PgClientLike {
  query: (sql: string, values?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  release: () => void;
}
interface EtcdLeaseLike {
  put: (key: string) => { value: (value: string, options?: { prevNoExist?: boolean }) => Promise<unknown> };
  revoke: () => Promise<void>;
}
interface EtcdClientLike {
  lease: (ttlSeconds: number) => EtcdLeaseLike;
  get: (key: string) => { string: () => Promise<string | null>; exec?: () => Promise<unknown> };
  if: (key: string, compare: string, value: string) => { then: (op: unknown) => { commit: () => Promise<{ succeeded: boolean }> } };
  delete: () => { key: (key: string) => unknown };
}

export function createDistributedLockStore(config: RuntimeConfig): DistributedLockStore {
  const provider = config.workflow.runLockProvider ?? 'noop';
  if (provider === 'redis') {
    const dsn = requireDsn(config, provider);
    return new RedisDistributedLockStore(async () => loadRedisClient(dsn));
  }
  if (provider === 'postgresql') {
    const dsn = requireDsn(config, provider);
    return new PostgresDistributedLockStore(async () => loadPostgresPool(dsn));
  }
  if (provider === 'etcd') {
    const dsn = requireDsn(config, provider);
    return new EtcdDistributedLockStore(async () => loadEtcdClient(dsn));
  }
  return new InMemoryDistributedLockStore();
}

function requireDsn(config: RuntimeConfig, provider: 'redis' | 'postgresql' | 'etcd'): string {
  const dsn = config.workflow.runLockDsn;
  if (!dsn) throw new ConfigError(`workflow.runLockDsn is required when workflow.runLockProvider=${provider}`);
  return dsn;
}

class RedisDistributedLockStore implements DistributedLockStore {
  private readonly loadClient: () => Promise<RedisLike>;
  constructor(loadClient: () => Promise<RedisLike>) { this.loadClient = loadClient; }
  async acquire(input: { resource: string; ownerId: string; nowIso: string; ttlMs: number }) {
    const client = await this.loadClient();
    const token = await client.incr(redisFencingCounterKey(input.resource));
    const lease = asLease(input, token);
    const acquired = await client.set(redisLeaseKey(input.resource), JSON.stringify(lease), { NX: true, PX: input.ttlMs });
    if (!isRedisOk(acquired)) {
      const currentRaw = await client.get(redisLeaseKey(input.resource));
      return { acquired: false as const, reason: 'already_locked' as const, lease: currentRaw ? JSON.parse(currentRaw) : lease };
    }
    return { acquired: true as const, lease };
  }
  async release(input: { resource: string; ownerId: string; fencingToken: number }) {
    const client = await this.loadClient();
    const key = redisLeaseKey(input.resource);
    const currentRaw = await client.get(key);
    if (!currentRaw) return { released: false as const, reason: 'missing_lock' as const };
    const cur = JSON.parse(currentRaw) as DistributedLockLease;
    if (cur.ownerId !== input.ownerId) return { released: false as const, reason: 'owner_mismatch' as const, lease: cur };
    if (cur.fencingToken !== input.fencingToken) return { released: false as const, reason: 'stale_fencing_token' as const, lease: cur };
    const result = await client.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      { keys: [key], arguments: [currentRaw] },
    );
    return Number(result) === 1 ? { released: true as const } : { released: false as const, reason: 'stale_fencing_token' as const, lease: cur };
  }
  async validate(input: { resource: string; ownerId: string; fencingToken: number; nowIso: string }) {
    const client = await this.loadClient();
    const key = redisLeaseKey(input.resource);
    const currentRaw = await client.get(key);
    if (!currentRaw) return { valid: false as const, reason: 'missing_lock' as const };
    const cur = JSON.parse(currentRaw) as DistributedLockLease;
    if (new Date(cur.expiresAtIso).getTime() <= new Date(input.nowIso).getTime()) return { valid: false as const, reason: 'expired' as const, lease: cur };
    if (cur.ownerId !== input.ownerId) return { valid: false as const, reason: 'owner_mismatch' as const, lease: cur };
    if (cur.fencingToken !== input.fencingToken) return { valid: false as const, reason: 'stale_fencing_token' as const, lease: cur };
    const lua = await client.eval('if redis.call("GET", KEYS[1]) == ARGV[1] then return 1 else return 0 end', { keys: [key], arguments: [currentRaw] });
    return Number(lua) === 1 ? { valid: true as const, lease: cur } : { valid: false as const, reason: 'stale_fencing_token' as const, lease: cur };
  }
}

class PostgresDistributedLockStore implements DistributedLockStore {
  private readonly loadPool: () => Promise<PgPoolLike>;
  constructor(loadPool: () => Promise<PgPoolLike>) { this.loadPool = loadPool; }
  async acquire(input: { resource: string; ownerId: string; nowIso: string; ttlMs: number }) {
    const client = await (await this.loadPool()).connect();
    try {
      await client.query('BEGIN');
      await ensurePgSchema(client);
      const lock = await client.query('SELECT lease_payload FROM workflow_fencing_locks WHERE resource = $1 FOR UPDATE', [input.resource]);
      if (lock.rows[0]?.lease_payload) {
        const lease = parseLeasePayload(lock.rows[0].lease_payload);
        if (new Date(lease.expiresAtIso).getTime() > new Date(input.nowIso).getTime()) {
          await client.query('ROLLBACK');
          return { acquired: false as const, reason: 'already_locked' as const, lease };
        }
      }
      const tokenRow = await client.query('SELECT nextval(\'workflow_fencing_token_seq\') AS token');
      const token = Number(tokenRow.rows[0]?.token ?? 0);
      const lease = asLease(input, token);
      await client.query(
        'INSERT INTO workflow_fencing_locks(resource, lease_payload) VALUES ($1, $2::jsonb) ON CONFLICT(resource) DO UPDATE SET lease_payload = EXCLUDED.lease_payload',
        [input.resource, JSON.stringify(lease)],
      );
      await client.query('COMMIT');
      return { acquired: true as const, lease };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  async release(input: { resource: string; ownerId: string; fencingToken: number }) {
    const pool = await this.loadPool();
    const client = await pool.connect();
    try {
      await ensurePgSchema(client);
      const row = await client.query('SELECT lease_payload FROM workflow_fencing_locks WHERE resource = $1', [input.resource]);
      if (!row.rows[0]?.lease_payload) return { released: false as const, reason: 'missing_lock' as const };
      const lease = parseLeasePayload(row.rows[0].lease_payload);
      if (lease.ownerId !== input.ownerId) return { released: false as const, reason: 'owner_mismatch' as const, lease };
      if (lease.fencingToken !== input.fencingToken) return { released: false as const, reason: 'stale_fencing_token' as const, lease };
      await client.query('DELETE FROM workflow_fencing_locks WHERE resource = $1', [input.resource]);
      return { released: true as const };
    } finally { client.release(); }
  }
  async validate(input: { resource: string; ownerId: string; fencingToken: number; nowIso: string }) {
    const pool = await this.loadPool();
    const client = await pool.connect();
    try {
      await ensurePgSchema(client);
      const row = await client.query('SELECT lease_payload FROM workflow_fencing_locks WHERE resource = $1', [input.resource]);
      if (!row.rows[0]?.lease_payload) return { valid: false as const, reason: 'missing_lock' as const };
      const lease = parseLeasePayload(row.rows[0].lease_payload);
      if (new Date(lease.expiresAtIso).getTime() <= new Date(input.nowIso).getTime()) return { valid: false as const, reason: 'expired' as const, lease };
      if (lease.ownerId !== input.ownerId) return { valid: false as const, reason: 'owner_mismatch' as const, lease };
      if (lease.fencingToken !== input.fencingToken) return { valid: false as const, reason: 'stale_fencing_token' as const, lease };
      return { valid: true as const, lease };
    } finally { client.release(); }
  }
}

class EtcdDistributedLockStore implements DistributedLockStore {
  private readonly loadClient: () => Promise<EtcdClientLike>;
  constructor(loadClient: () => Promise<EtcdClientLike>) { this.loadClient = loadClient; }
  async acquire(input: { resource: string; ownerId: string; nowIso: string; ttlMs: number }) {
    const client = await this.loadClient();
    const leaseEtcd = client.lease(Math.max(1, Math.floor(input.ttlMs / 1000)));
    const provisionalLease = asLease(input, 0);
    let putResult: unknown;
    try { putResult = await leaseEtcd.put(etcdLeaseKey(input.resource)).value(JSON.stringify(provisionalLease), { prevNoExist: true }); }
    catch { return { acquired: false as const, reason: 'already_locked' as const, lease: provisionalLease }; }
    const token = extractEtcdRevision(putResult);
    return { acquired: true as const, lease: asLease(input, token) };
  }
  async release(input: { resource: string; ownerId: string; fencingToken: number }) {
    const v = await this.validate({ ...input, nowIso: new Date().toISOString() });
    if (!v.valid) return { released: false as const, reason: v.reason as 'missing_lock' | 'owner_mismatch' | 'stale_fencing_token', ...(v.lease ? { lease: v.lease } : {}) };
    const client = await this.loadClient();
    await client.delete().key(etcdLeaseKey(input.resource));
    return { released: true as const };
  }
  async validate(input: { resource: string; ownerId: string; fencingToken: number; nowIso: string }) {
    const client = await this.loadClient();
    const leaseRecord = await readEtcdLeaseRecord(client, etcdLeaseKey(input.resource));
    if (!leaseRecord) return { valid: false as const, reason: 'missing_lock' as const };
    const lease = leaseRecord.lease;
    if (new Date(lease.expiresAtIso).getTime() <= new Date(input.nowIso).getTime()) return { valid: false as const, reason: 'expired' as const, lease };
    if (lease.ownerId !== input.ownerId) return { valid: false as const, reason: 'owner_mismatch' as const, lease };
    if (leaseRecord.revision !== input.fencingToken) return { valid: false as const, reason: 'stale_fencing_token' as const, lease };
    return { valid: true as const, lease };
  }
}

function asLease(input: { resource: string; ownerId: string; nowIso: string; ttlMs: number }, token: number): DistributedLockLease {
  return {
    resource: input.resource,
    ownerId: input.ownerId,
    fencingToken: token,
    acquiredAtIso: input.nowIso,
    expiresAtIso: new Date(new Date(input.nowIso).getTime() + input.ttlMs).toISOString(),
  };
}

function redisLeaseKey(resource: string): string { return `ai-orchestrator:fencing:lease:${resource}`; }
function redisFencingCounterKey(resource: string): string { return `ai-orchestrator:fencing:counter:${resource}`; }
function etcdLeaseKey(resource: string): string { return `ai-orchestrator/fencing/lease/${resource}`; }
function isRedisOk(value: unknown): boolean { return typeof value === 'string' && value.toUpperCase() === 'OK'; }
async function ensurePgSchema(client: PgClientLike): Promise<void> {
  await client.query('CREATE SEQUENCE IF NOT EXISTS workflow_fencing_token_seq');
  await client.query('CREATE TABLE IF NOT EXISTS workflow_fencing_locks(resource text PRIMARY KEY, lease_payload jsonb NOT NULL)');
}
async function loadRedisClient(dsn: string): Promise<RedisLike> {
  const module = await import('redis').catch(() => { throw new ConfigError('Redis fencing store requires `redis` package'); });
  const client = module.createClient({ url: dsn });
  await client.connect();
  return client as unknown as RedisLike;
}
async function loadPostgresPool(dsn: string): Promise<PgPoolLike> {
  const module = await import('pg').catch(() => { throw new ConfigError('PostgreSQL fencing store requires `pg` package'); });
  return new module.Pool({ connectionString: dsn });
}
async function loadEtcdClient(dsn: string): Promise<EtcdClientLike> {
  const module = await import('etcd3').catch(() => { throw new ConfigError('Etcd fencing store requires `etcd3` package'); });
  return new module.Etcd3({ hosts: dsn }) as EtcdClientLike;
}

function parseLeasePayload(payload: unknown): DistributedLockLease {
  if (typeof payload === 'string') {
    return JSON.parse(payload) as DistributedLockLease;
  }
  return payload as DistributedLockLease;
}

function extractEtcdRevision(result: unknown): number {
  if (!result || typeof result !== 'object') {
    throw new ConfigError('Etcd fencing acquire did not return a revision header');
  }
  const maybeHeader = (result as { header?: { revision?: string | number } }).header;
  const revisionRaw = maybeHeader?.revision;
  const revision = typeof revisionRaw === 'string' ? Number(revisionRaw) : revisionRaw;
  if (typeof revision !== 'number' || !Number.isFinite(revision) || revision <= 0) {
    throw new ConfigError('Etcd fencing acquire returned invalid revision for fencing token');
  }
  return revision;
}

async function readEtcdLeaseRecord(client: EtcdClientLike, key: string): Promise<{ lease: DistributedLockLease; revision: number } | null> {
  const raw = await client.get(key).string();
  if (!raw) {
    return null;
  }
  const lease = JSON.parse(raw) as DistributedLockLease;
  const exec = client.get(key).exec;
  if (!exec) {
    throw new ConfigError('Etcd fencing validate requires adapter support for metadata reads (get(...).exec)');
  }
  const response = await exec();
  const revision = extractEtcdKvRevision(response);
  if (!revision) {
    throw new ConfigError('Etcd fencing validate could not extract revision metadata from adapter response');
  }
  return { lease, revision };
}

function extractEtcdKvRevision(response: unknown): number | null {
  if (!response || typeof response !== 'object') {
    return null;
  }
  const kvs = (response as { kvs?: { mod_revision?: string | number; create_revision?: string | number }[] }).kvs;
  const first = kvs?.[0];
  const raw = first?.mod_revision ?? first?.create_revision;
  const parsed = typeof raw === 'string' ? Number(raw) : raw;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
