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

void test('Anthropic client sends JSON schema output_config and reads parsed_output', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;
  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    capturedBody = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
    return new Response(JSON.stringify({ parsed_output: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    const client = createLlmClient({
      provider: 'anthropic',
      model: 'claude-test',
      apiKey: 'test-api-key',
      temperature: 0.2,
      timeoutMs: 1000,
    });
    const schema = {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    };

    const output = await client.generateObject<{ ok: boolean }>({
      schemaName: 'ok_schema',
      prompt: 'return ok',
      schema,
    });

    assert.deepEqual(output, { ok: true });
    assert.equal(isRecord(capturedBody), true);
    if (!isRecord(capturedBody)) {
      assert.fail('Expected captured request body');
    }
    assert.deepEqual(capturedBody.output_config, {
      format: {
        type: 'json_schema',
        schema,
      },
    });
    assert.deepEqual(capturedBody.messages, [{ role: 'user', content: 'return ok' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
