# Postgres Persistence Lacks Versioned Migrations And Operational Contracts

## Issue ID
010

## Severity
Medium

## Category
Configuration, State Management, Operational Safety, Scalability, Maintainability

## Summary
PostgreSQL persistence initializes schema by running an in-code list of `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE IF NOT EXISTS` statements on startup. There is no migration history table, no applied-version tracking, and no clear operational migration boundary.

## Evidence
- `packages/state/src/postgres/PostgresStateStore.ts` calls `createPostgresMigrations` during `ensureInitialized`.
- `packages/state/src/postgres/migrations.ts` returns an array of migration objects, but no migration ID is persisted.
- Every startup loops through all migration statements.
- Schema changes include backfill and `ALTER COLUMN SET NOT NULL` operations embedded in runtime initialization.
- `PostgresStateStore` dynamically imports `pg`, but `pg` is not declared in root `package.json` dependencies.

## Why This Is a Problem
Production databases need predictable, observable migration execution. Running schema migrations implicitly at application startup hides operational risk inside normal runtime paths and makes it difficult to know which migrations have been applied. Missing dependency declarations also make the PostgreSQL backend fail only when selected at runtime.

## Risk
- Startup can fail or block because a runtime process attempts schema changes.
- Operators cannot audit applied migrations.
- Partial migration failure can leave the database in an ambiguous state.
- PostgreSQL mode can be configured but fail due to missing runtime dependencies.

## Recommended Direction
Move database schema changes to an explicit migration system with recorded versions, operational commands, and dependency declarations. Runtime startup should verify schema compatibility, not mutate it by default.

## Suggested Refactoring Steps
1. Add a schema migrations table and record applied migration IDs.
2. Separate migration execution from normal `PostgresStateStore` initialization.
3. Add a startup compatibility check for required schema version.
4. Declare required database provider dependencies or isolate provider packages.
5. Add operational documentation for migration ordering and rollback expectations.

## Acceptance Criteria for Resolution
- Applied migrations are recorded durably.
- Runtime startup does not silently run schema-changing migrations unless explicitly configured.
- PostgreSQL dependencies are declared in the appropriate package manifest.
- Failed migrations are observable and recoverable.
- Tests verify migration version tracking and schema compatibility checks.
