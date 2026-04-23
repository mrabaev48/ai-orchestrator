import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  clearRuntimeSecrets,
  ConfigError,
  loadRuntimeConfig,
  redactSecrets,
  registerRuntimeSecrets,
} from '../packages/shared/src/index.ts';

test.afterEach(() => {
  clearRuntimeSecrets();
});

test('loadRuntimeConfig applies defaults and normalizes paths', () => {
  const config = loadRuntimeConfig({
    cwd: '/tmp/workspace',
    env: {
      LLM_PROVIDER: 'mock',
      LLM_MODEL: 'gpt-test',
      TOOL_ALLOWED_WRITE_PATHS: 'src,tests',
    },
  });

  assert.equal(config.workflow.maxStepsPerRun, 8);
  assert.equal(config.tools.allowedWritePaths[0], '/tmp/workspace/src');
  assert.equal(config.tools.allowedWritePaths[1], '/tmp/workspace/tests');
});

test('loadRuntimeConfig rejects invalid numeric values', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '0',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects workflow values outside policy bounds', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '201',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects retry cap larger than step cap', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '2',
          MAX_RETRIES_PER_TASK: '3',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects non-directory write path scopes', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-runtime-config-file-path-'));
  const filePath = path.join(tempDir, 'not-a-directory.txt');
  writeFileSync(filePath, 'x', 'utf8');

  assert.throws(
    () =>
      loadRuntimeConfig({
        cwd: tempDir,
        env: {
          TOOL_ALLOWED_WRITE_PATHS: filePath,
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects sqlite path when ancestor directory is not writable', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          STATE_BACKEND: 'sqlite',
          SQLITE_PATH: '/dev/null/state.db',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('redactSecrets removes secret-like keys recursively', () => {
  const redacted = redactSecrets({
    apiKey: 'secret',
    nested: {
      token: 'abc',
      ok: 'value',
    },
  });

  assert.deepEqual(redacted, {
    apiKey: '<redacted>',
    nested: {
      token: '<redacted>',
      ok: 'value',
    },
  });
});

test('redactSecrets masks common provider secret string formats', () => {
  const redacted = redactSecrets({
    authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
    prompt: 'Use key sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 and continue',
    inline: 'api_key: super-secret-value',
  });

  assert.deepEqual(redacted, {
    authorization: 'Bearer <redacted>',
    prompt: 'Use key <redacted> and continue',
    inline: 'api_key: <redacted>',
  });
});

test('redactSecrets avoids replacing likely non-secret short assignments', () => {
  const redacted = redactSecrets({
    text: 'Please create a token=done marker and keep going',
  });

  assert.deepEqual(redacted, {
    text: 'Please create a token=done marker and keep going',
  });
});

test('redactSecrets masks explicitly registered runtime secrets', () => {
  registerRuntimeSecrets(['provider-credential-not-matching-fallback']);

  const redacted = redactSecrets({
    prompt: 'Credential: provider-credential-not-matching-fallback',
  });

  assert.deepEqual(redacted, {
    prompt: 'Credential: <redacted>',
  });
});

test('loadRuntimeConfig auto-registers configured secret fields for string redaction', () => {
  loadRuntimeConfig({
    env: {
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4.1',
      LLM_API_KEY: 'provider-runtime-secret-001',
      TOOL_ALLOWED_WRITE_PATHS: '.',
    },
  });

  const redacted = redactSecrets('LLM secret provider-runtime-secret-001');
  assert.equal(redacted, 'LLM secret <redacted>');
});
