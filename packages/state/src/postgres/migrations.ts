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
    {
      id: 2,
      name: 'run_step_log',
      statements: [
        `CREATE TABLE IF NOT EXISTS ${table('run_step_log')} (
          id UUID PRIMARY KEY,
          run_id UUID NOT NULL,
          task_id TEXT,
          role TEXT NOT NULL,
          tool TEXT,
          input_text TEXT NOT NULL,
          output_text TEXT NOT NULL,
          status TEXT NOT NULL,
          duration_ms INTEGER NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS run_step_log_run_id_created_at_idx
          ON ${table('run_step_log')} (run_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS run_step_log_task_id_created_at_idx
          ON ${table('run_step_log')} (task_id, created_at DESC)`,
      ],
    },
    {
      id: 3,
      name: 'tenant_scope',
      statements: [
        `ALTER TABLE ${table('project_snapshots')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('project_snapshots')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `ALTER TABLE ${table('domain_events')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('domain_events')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `ALTER TABLE ${table('decision_log')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('decision_log')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `ALTER TABLE ${table('failure_log')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('failure_log')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `ALTER TABLE ${table('artifact_log')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('artifact_log')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `ALTER TABLE ${table('run_step_log')} ADD COLUMN IF NOT EXISTS org_id TEXT`,
        `ALTER TABLE ${table('run_step_log')} ADD COLUMN IF NOT EXISTS project_id TEXT`,
        `CREATE INDEX IF NOT EXISTS project_snapshots_tenant_created_at_idx
          ON ${table('project_snapshots')} (org_id, project_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS domain_events_tenant_created_at_idx
          ON ${table('domain_events')} (org_id, project_id, created_at DESC)`,
        `CREATE INDEX IF NOT EXISTS run_step_log_tenant_run_id_created_at_idx
          ON ${table('run_step_log')} (org_id, project_id, run_id, created_at DESC)`,
      ],
    },
    {
      id: 4,
      name: 'tenant_backfill_and_guards',
      statements: [
        `UPDATE ${table('project_snapshots')}
         SET org_id = COALESCE(org_id, snapshot_json->>'orgId', 'default-org'),
             project_id = COALESCE(project_id, snapshot_json->>'projectId', 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `UPDATE ${table('domain_events')}
         SET org_id = COALESCE(org_id, 'default-org'),
             project_id = COALESCE(project_id, 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `UPDATE ${table('decision_log')}
         SET org_id = COALESCE(org_id, 'default-org'),
             project_id = COALESCE(project_id, 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `UPDATE ${table('failure_log')}
         SET org_id = COALESCE(org_id, 'default-org'),
             project_id = COALESCE(project_id, 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `UPDATE ${table('artifact_log')}
         SET org_id = COALESCE(org_id, 'default-org'),
             project_id = COALESCE(project_id, 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `UPDATE ${table('run_step_log')}
         SET org_id = COALESCE(org_id, 'default-org'),
             project_id = COALESCE(project_id, 'ai-orchestrator')
         WHERE org_id IS NULL OR project_id IS NULL`,
        `ALTER TABLE ${table('project_snapshots')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('project_snapshots')} ALTER COLUMN project_id SET NOT NULL`,
        `ALTER TABLE ${table('domain_events')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('domain_events')} ALTER COLUMN project_id SET NOT NULL`,
        `ALTER TABLE ${table('decision_log')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('decision_log')} ALTER COLUMN project_id SET NOT NULL`,
        `ALTER TABLE ${table('failure_log')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('failure_log')} ALTER COLUMN project_id SET NOT NULL`,
        `ALTER TABLE ${table('artifact_log')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('artifact_log')} ALTER COLUMN project_id SET NOT NULL`,
        `ALTER TABLE ${table('run_step_log')} ALTER COLUMN org_id SET NOT NULL`,
        `ALTER TABLE ${table('run_step_log')} ALTER COLUMN project_id SET NOT NULL`,
      ],
    },
  ];
}
