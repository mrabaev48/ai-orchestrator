import assert from 'node:assert/strict';
import test from 'node:test';

import { createLlmClient, LlmProviderError, MockLlmClient } from './index.js';

void test('MockLlmClient returns queued structured outputs deterministically', async () => {
  const client = new MockLlmClient([{ ok: true }]);

  const output = await client.generateObject<{ ok: boolean }>({
    schemaName: 'ok_schema',
    prompt: 'return ok',
    schema: { type: 'object' },
  });

  assert.deepEqual(output, { ok: true });
});

void test('provider-backed clients require api key before network calls', async () => {
  const client = createLlmClient({
    provider: 'openai',
    model: 'gpt-test',
    temperature: 0.2,
    timeoutMs: 1000,
  });

  await assert.rejects(
    () => client.generateObject({
      schemaName: 'missing_key',
      prompt: 'return json',
      schema: { type: 'object' },
    }),
    (error: unknown) =>
      error instanceof LlmProviderError &&
      error.message === 'OpenAI provider requires llm.apiKey',
  );
});
