import { StateStoreError } from '@ai-orchestrator/shared';

export interface PgQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
}

export interface PgQueryClient {
  readonly query: <Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ) => Promise<PgQueryResult<Row>>;
}

export interface PgTransactionClient extends PgQueryClient {
  release: () => void;
}

export interface PgPoolLike extends PgQueryClient {
  connect: () => Promise<PgTransactionClient>;
}

interface PgModule {
  Pool: new (options: { connectionString: string }) => PgPoolLike;
}

export async function loadPgPool(connectionString: string): Promise<PgPoolLike> {
  try {
    const pgModule = asPgModule(await importOptionalModule('pg'));
    return new pgModule.Pool({ connectionString });
  } catch (error) {
    throw new StateStoreError(
      'PostgreSQL backend requires the "pg" package to be installed and resolvable at runtime',
      { cause: error },
    );
  }
}

export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function isPgUndefinedTableOrSchema(error: unknown): boolean {
  return isPgErrorCode(error, '42P01') || isPgErrorCode(error, '3F000');
}

export function isPgUniqueViolation(error: unknown): boolean {
  return isPgErrorCode(error, '23505');
}

async function importOptionalModule(moduleName: string): Promise<unknown> {
  return await import(moduleName);
}

function asPgModule(module: unknown): PgModule {
  if (isRecord(module) && typeof module.Pool === 'function') {
    return module as unknown as PgModule;
  }
  throw new StateStoreError('PostgreSQL backend loaded an invalid "pg" module');
}

function isPgErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
