export interface PostgresMigration {
  id: number;
  name: string;
  statements: string[];
}

export function createPostgresMigrations(table: (name: string) => string): PostgresMigration[] {
  return [
    {
      id: 1,
      name: 'init',
      statements: [
        `CREATE TABLE IF NOT EXISTS ${table('project_snapshots')} (
          id UUID PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL,
          snapshot_json JSONB NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ${table('domain_events')} (
          id UUID PRIMARY KEY,
          event_type TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          run_id UUID,
          payload_json JSONB NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ${table('decision_log')} (
          id UUID PRIMARY KEY,
          created_at TIMESTAMPTZ NOT NULL,
          title TEXT NOT NULL,
          decision TEXT NOT NULL,
          rationale TEXT NOT NULL,
          affected_areas_json JSONB NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ${table('failure_log')} (
          id UUID PRIMARY KEY,
          task_id TEXT NOT NULL,
          role TEXT NOT NULL,
          reason TEXT NOT NULL,
          symptoms_json JSONB NOT NULL,
          bad_patterns_json JSONB NOT NULL,
          retry_suggested BOOLEAN NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS ${table('artifact_log')} (
          id UUID PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          location TEXT,
          metadata_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )`,
      ],
    },
  ];
}
