# PostgreSQL State Migrations

## Purpose

The PostgreSQL state backend uses explicit, versioned schema migrations. Runtime startup verifies the schema version and does not run schema-changing DDL unless `STATE_POSTGRES_MIGRATION_MODE=auto` is explicitly configured.

## Apply Migrations

1. Confirm `STATE_BACKEND=postgresql`, `POSTGRES_DSN`, and `POSTGRES_SCHEMA`.
2. Run:

   ```bash
   pnpm state:migrate
   ```

3. Confirm the JSON output reports `status: "ok"` and `appliedVersion` equal to `requiredVersion`.
4. Start runtime processes only after the migration command succeeds.

## Operational Contract

- Applied migrations are recorded in `<schema>.schema_migrations`.
- Each applied row includes `id`, `name`, `checksum`, `applied_at`, and `execution_ms`.
- Runtime verification fails if the history table is missing, behind the required version, non-contiguous, unknown, or checksum-mismatched.
- Failed migrations are rolled back and surfaced as structured `StateStoreError` diagnostics with the migration id, name, and checksum.

## Rollback Expectations

Migrations are forward-only. If a migration fails, fix the database or migration issue, then rerun `pnpm state:migrate`. If a successfully applied migration must be reverted, restore from a database backup or apply a reviewed corrective migration in a follow-up release.

## Development Escape Hatch

`STATE_POSTGRES_MIGRATION_MODE=auto` allows the `PostgresStateStore` to apply pending migrations during initialization. Do not use this mode for production runtime processes; it exists for local and controlled development scenarios only.
