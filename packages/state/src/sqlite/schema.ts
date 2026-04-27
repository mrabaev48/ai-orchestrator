export const sqliteSchemaStatements = [
  `CREATE TABLE IF NOT EXISTS project_snapshots (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    ) STRICT`,
  `CREATE TABLE IF NOT EXISTS domain_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      run_id TEXT,
      payload_json TEXT NOT NULL
    ) STRICT`,
  `CREATE TABLE IF NOT EXISTS decision_log (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      title TEXT NOT NULL,
      decision TEXT NOT NULL,
      rationale TEXT NOT NULL,
      affected_areas_json TEXT NOT NULL
    ) STRICT`,
  `CREATE TABLE IF NOT EXISTS failure_log (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      reason TEXT NOT NULL,
      symptoms_json TEXT NOT NULL,
      bad_patterns_json TEXT NOT NULL,
      retry_suggested INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT`,
  `CREATE TABLE IF NOT EXISTS artifact_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      location TEXT,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT`,
  `CREATE TABLE IF NOT EXISTS run_step_log (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      task_id TEXT,
      role TEXT NOT NULL,
      tool TEXT,
      input_text TEXT NOT NULL,
      output_text TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT`,
  `CREATE INDEX IF NOT EXISTS idx_run_step_log_run_id_created_at
    ON run_step_log (run_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_run_step_log_task_id_created_at
    ON run_step_log (task_id, created_at DESC)`,
];
