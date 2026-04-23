import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = path.resolve('apps/control-plane/src/cli.ts');

test('bootstrap writes initial state with memory backend', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-cli-'));

  try {
    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', cliPath, 'bootstrap', '--project-id', 'p1', '--project-name', 'Test'],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          LLM_PROVIDER: 'mock',
          LLM_MODEL: 'gpt-test',
          STATE_BACKEND: 'memory',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('bootstrap fails fast on invalid config', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'bootstrap'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_BACKEND: 'memory',
        MAX_STEPS_PER_RUN: '0',
        TOOL_ALLOWED_WRITE_PATHS: '.',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /CONFIG_ERROR|Invalid runtime/);
});

test('run-task fails fast without --task-id', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'run-task'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_BACKEND: 'memory',
        TOOL_ALLOWED_WRITE_PATHS: '.',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Missing --task-id argument for run-task command/);
});

test('run-task fails with deterministic error for missing task in state', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'run-task', '--task-id', 'missing-task'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_BACKEND: 'memory',
        TOOL_ALLOWED_WRITE_PATHS: '.',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 4);
  assert.match(result.stderr, /WORKFLOW_POLICY_ERROR/);
  assert.match(result.stderr, /invalid_task_id/);
});
