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


test('run-task is blocked by kill-switch without human override', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'run-task', '--task-id', 't-1'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_BACKEND: 'memory',
        TOOL_ALLOWED_WRITE_PATHS: '.',
        CONTROL_PLANE_KILL_SWITCH_ACTIVE: 'true',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 8);
  assert.match(result.stderr, /Kill-switch active/);
});

test('run-task accepts human override while kill-switch is active', () => {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, 'run-task', '--task-id', 'missing-task'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        STATE_BACKEND: 'memory',
        TOOL_ALLOWED_WRITE_PATHS: '.',
        CONTROL_PLANE_KILL_SWITCH_ACTIVE: 'true',
        CONTROL_PLANE_HUMAN_OVERRIDE_TOKEN: 'override-token',
        CONTROL_PLANE_HUMAN_OVERRIDE_REASON: 'incident commander approved',
        CONTROL_PLANE_HUMAN_OVERRIDE_TICKET_ID: 'INC-42',
        CONTROL_PLANE_HUMAN_OVERRIDE_EXPIRES_AT: '2099-01-01T00:00:00.000Z',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 4);
  assert.match(result.stderr, /invalid_task_id/);
});
