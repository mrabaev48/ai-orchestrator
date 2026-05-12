import { StateStoreError } from '@ai-orchestrator/shared';
import {
  createPostgresMigrations,
  POSTGRES_REQUIRED_SCHEMA_VERSION,
  POSTGRES_SCHEMA_MIGRATIONS_TABLE,
  type PostgresMigration,
} from './migrations.js';
import {
  isPgUndefinedTableOrSchema,
  loadPgPool,
  quotePostgresIdentifier,
  type PgPoolLike,
  type PgQueryClient,
  type PgTransactionClient,
} from './pg.js';

export interface PostgresAppliedMigration {
  readonly id: number;
  readonly name: string;
  readonly checksum: string;
  readonly appliedAt: string;
  readonly executionMs: number;
}

export interface PostgresMigrationRunnerOptions {
  readonly schema?: string;
  readonly migrations?: readonly PostgresMigration[];
}

export interface PostgresMigrationApplyResult {
  readonly requiredVersion: number;
  readonly appliedVersion: number;
  readonly appliedMigrations: readonly PostgresAppliedMigration[];
}

export interface PostgresSchemaCompatibility {
  readonly compatible: true;
  readonly requiredVersion: number;
  readonly appliedVersion: number;
  readonly appliedMigrations: readonly PostgresAppliedMigration[];
}

interface PostgresMigrationTableRow extends Record<string, unknown> {
  readonly id: number | string;
  readonly name: string;
  readonly checksum: string;
  readonly applied_at: string | Date;
  readonly execution_ms: number | string;
}

export class PostgresMigrationRunner {
  private readonly schema: string;
  private readonly migrations: readonly PostgresMigration[];

  constructor(
    private readonly pool: PgPoolLike,
    options: PostgresMigrationRunnerOptions = {},
  ) {
    this.schema = options.schema ?? 'public';
    this.migrations = options.migrations ?? createPostgresMigrations((name) => this.table(name));
    validatePostgresMigrations(this.migrations);
  }

  static async fromConnectionString(
    connectionString: string,
    options: PostgresMigrationRunnerOptions = {},
  ): Promise<PostgresMigrationRunner> {
    return new PostgresMigrationRunner(await loadPgPool(connectionString), options);
  }

  async applyPendingMigrations(): Promise<PostgresMigrationApplyResult> {
    const client = await this.pool.connect();
    try {
      await this.acquireMigrationLock(client);
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePostgresIdentifier(this.schema)}`);
      await this.ensureHistoryTable(client);
      const appliedBefore = await this.readAppliedMigrations(client);
      this.assertAppliedMigrationsAreCompatible(appliedBefore);

      const appliedIds = new Set(appliedBefore.map((migration) => migration.id));
      for (const migration of this.migrations) {
        if (appliedIds.has(migration.id)) {
          continue;
        }
        await this.applyMigration(client, migration);
      }

      const appliedMigrations = await this.readAppliedMigrations(client);
      this.assertAppliedMigrationsAreCompatible(appliedMigrations);
      return {
        requiredVersion: POSTGRES_REQUIRED_SCHEMA_VERSION,
        appliedVersion: latestAppliedVersion(appliedMigrations),
        appliedMigrations,
      };
    } finally {
      await this.releaseMigrationLock(client);
      client.release();
    }
  }

  async verifySchemaCompatibility(): Promise<PostgresSchemaCompatibility> {
    const appliedMigrations = await this.listAppliedMigrations();
    this.assertAppliedMigrationsAreCompatible(appliedMigrations);

    const appliedVersion = latestAppliedVersion(appliedMigrations);
    if (appliedVersion !== POSTGRES_REQUIRED_SCHEMA_VERSION) {
      throw new StateStoreError('PostgreSQL schema is not migrated to the required version', {
        details: {
          appliedVersion,
          requiredVersion: POSTGRES_REQUIRED_SCHEMA_VERSION,
          missingMigrationIds: this.migrations
            .filter((migration) => migration.id > appliedVersion)
            .map((migration) => migration.id),
        },
      });
    }

    return {
      compatible: true,
      requiredVersion: POSTGRES_REQUIRED_SCHEMA_VERSION,
      appliedVersion,
      appliedMigrations,
    };
  }

  async listAppliedMigrations(): Promise<readonly PostgresAppliedMigration[]> {
    try {
      return await this.readAppliedMigrations(this.pool);
    } catch (error) {
      if (isPgUndefinedTableOrSchema(error)) {
        return [];
      }
      throw new StateStoreError('Unable to read PostgreSQL schema migration history', { cause: error });
    }
  }

  private async applyMigration(client: PgTransactionClient, migration: PostgresMigration): Promise<void> {
    const startedAt = Date.now();
    try {
      await client.query('BEGIN');
      for (const statement of migration.statements) {
        await client.query(statement);
      }
      await client.query(
        `INSERT INTO ${this.historyTable()} (id, name, checksum, execution_ms)
         VALUES ($1, $2, $3, $4)`,
        [migration.id, migration.name, migration.checksum, Date.now() - startedAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new StateStoreError('PostgreSQL schema migration failed', {
        cause: error,
        details: {
          migrationId: migration.id,
          migrationName: migration.name,
          checksum: migration.checksum,
        },
      });
    }
  }

  private async ensureHistoryTable(client: PgQueryClient): Promise<void> {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${this.historyTable()} (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_ms INTEGER NOT NULL
      )`,
    );
  }

  private async readAppliedMigrations(client: PgQueryClient): Promise<readonly PostgresAppliedMigration[]> {
    const result = await client.query<PostgresMigrationTableRow>(
      `SELECT id, name, checksum, applied_at, execution_ms
       FROM ${this.historyTable()}
       ORDER BY id ASC`,
    );

    return result.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at instanceof Date ? row.applied_at.toISOString() : row.applied_at,
      executionMs: Number(row.execution_ms),
    }));
  }

  private assertAppliedMigrationsAreCompatible(appliedMigrations: readonly PostgresAppliedMigration[]): void {
    const knownById = new Map(this.migrations.map((migration) => [migration.id, migration]));
    const appliedIds = new Set<number>();

    for (const appliedMigration of appliedMigrations) {
      if (appliedIds.has(appliedMigration.id)) {
        throw new StateStoreError('PostgreSQL schema migration history contains duplicate ids', {
          details: { migrationId: appliedMigration.id },
        });
      }
      appliedIds.add(appliedMigration.id);

      const knownMigration = knownById.get(appliedMigration.id);
      if (!knownMigration) {
        throw new StateStoreError('PostgreSQL schema migration history contains an unknown migration', {
          details: { migrationId: appliedMigration.id, migrationName: appliedMigration.name },
        });
      }

      if (knownMigration.name !== appliedMigration.name || knownMigration.checksum !== appliedMigration.checksum) {
        throw new StateStoreError('PostgreSQL schema migration history checksum mismatch', {
          details: {
            migrationId: appliedMigration.id,
            expectedName: knownMigration.name,
            actualName: appliedMigration.name,
            expectedChecksum: knownMigration.checksum,
            actualChecksum: appliedMigration.checksum,
          },
        });
      }
    }

    const appliedVersion = latestAppliedVersion(appliedMigrations);
    const missingBeforeApplied = this.migrations
      .filter((migration) => migration.id < appliedVersion && !appliedIds.has(migration.id))
      .map((migration) => migration.id);
    if (missingBeforeApplied.length > 0) {
      throw new StateStoreError('PostgreSQL schema migration history is not contiguous', {
        details: { appliedVersion, missingMigrationIds: missingBeforeApplied },
      });
    }
  }

  private async acquireMigrationLock(client: PgQueryClient): Promise<void> {
    await client.query('SELECT pg_advisory_lock(hashtext($1), hashtext($2))', [
      'ai-orchestrator-state-migrations',
      this.schema,
    ]);
  }

  private async releaseMigrationLock(client: PgQueryClient): Promise<void> {
    await client.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [
      'ai-orchestrator-state-migrations',
      this.schema,
    ]);
  }

  private table(name: string): string {
    return `${quotePostgresIdentifier(this.schema)}.${quotePostgresIdentifier(name)}`;
  }

  private historyTable(): string {
    return this.table(POSTGRES_SCHEMA_MIGRATIONS_TABLE);
  }
}

export function validatePostgresMigrations(migrations: readonly PostgresMigration[]): void {
  const ids = new Set<number>();
  const names = new Set<string>();
  let previousId = 0;

  for (const migration of migrations) {
    if (!Number.isInteger(migration.id) || migration.id <= 0) {
      throw new StateStoreError('PostgreSQL migration ids must be positive integers', {
        details: { migrationId: migration.id, migrationName: migration.name },
      });
    }
    if (migration.id <= previousId) {
      throw new StateStoreError('PostgreSQL migrations must be ordered by ascending id', {
        details: { migrationId: migration.id, previousId },
      });
    }
    if (ids.has(migration.id)) {
      throw new StateStoreError('PostgreSQL migrations contain duplicate ids', {
        details: { migrationId: migration.id },
      });
    }
    if (names.has(migration.name)) {
      throw new StateStoreError('PostgreSQL migrations contain duplicate names', {
        details: { migrationName: migration.name },
      });
    }
    if (migration.statements.length === 0) {
      throw new StateStoreError('PostgreSQL migrations must include at least one statement', {
        details: { migrationId: migration.id, migrationName: migration.name },
      });
    }

    ids.add(migration.id);
    names.add(migration.name);
    previousId = migration.id;
  }

  if (previousId !== POSTGRES_REQUIRED_SCHEMA_VERSION) {
    throw new StateStoreError('PostgreSQL required schema version does not match latest migration id', {
      details: {
        requiredVersion: POSTGRES_REQUIRED_SCHEMA_VERSION,
        latestMigrationId: previousId,
      },
    });
  }
}

function latestAppliedVersion(appliedMigrations: readonly PostgresAppliedMigration[]): number {
  return appliedMigrations.at(-1)?.id ?? 0;
}
