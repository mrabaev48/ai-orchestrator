import test from 'node:test';
import assert from 'node:assert/strict';

import { ConfigError, loadRuntimeConfig, redactSecrets } from '../packages/shared/src/index.ts';

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
