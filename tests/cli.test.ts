import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = path.resolve('apps/control-plane/src/cli.ts');

test('bootstrap writes initial sqlite state', () => {
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
          TOOL_ALLOWED_WRITE_PATHS: '.',
          SQLITE_PATH: 'state/runtime.db',
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
    const dbExists = readFileSync(path.join(tempDir, 'state/runtime.db'));
    assert.ok(dbExists.byteLength > 0);
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
        MAX_STEPS_PER_RUN: '0',
        TOOL_ALLOWED_WRITE_PATHS: '.',
      },
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /CONFIG_ERROR|Invalid runtime/);
});
