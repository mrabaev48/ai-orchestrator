export interface LlmGenerateRequest<TSchema> {
  schemaName: string;
  prompt: string;
  schema: TSchema;
}

export interface LlmClient {
  generateObject: <TOutput>(request: LlmGenerateRequest<Record<string, unknown>>) => Promise<TOutput>;
}

export type LlmProvider = 'openai' | 'anthropic' | 'mock';

export interface CreateLlmClientInput {
  provider: LlmProvider;
  model: string;
  apiKey?: string;
  temperature: number;
  timeoutMs: number;
  mockOutputs?: unknown[];
}

export class LlmProviderError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}

export class MockLlmClient implements LlmClient {
  private readonly queue: unknown[];

  constructor(outputs: unknown[] = []) {
    this.queue = [...outputs];
  }

  async generateObject<TOutput>(
    request: LlmGenerateRequest<Record<string, unknown>>,
  ): Promise<TOutput> {
    void request;
    if (this.queue.length === 0) {
      throw new Error('MockLlmClient queue is empty');
    }

    return this.queue.shift() as TOutput;
  }
}

export function createLlmClient(input: CreateLlmClientInput): LlmClient {
  switch (input.provider) {
    case 'mock':
      return new MockLlmClient(input.mockOutputs ?? []);
    case 'openai':
      return new OpenAiResponsesLlmClient(input);
    case 'anthropic':
      return new AnthropicMessagesLlmClient(input);
  }
}

class OpenAiResponsesLlmClient implements LlmClient {
  constructor(private readonly input: CreateLlmClientInput) {}

  async generateObject<TOutput>(request: LlmGenerateRequest<Record<string, unknown>>): Promise<TOutput> {
    const apiKey = requireApiKey(this.input, 'OpenAI');
    const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.input.model,
        input: request.prompt,
        temperature: this.input.temperature,
        text: {
          format: {
            type: 'json_schema',
            name: request.schemaName,
            schema: request.schema,
            strict: true,
          },
        },
      }),
    }, this.input.timeoutMs);
    const payload = await parseJsonResponse(response, 'OpenAI Responses API');
    const text = readOpenAiOutputText(payload);
    return parseGeneratedObject(text, 'OpenAI Responses API') as TOutput;
  }
}

class AnthropicMessagesLlmClient implements LlmClient {
  constructor(private readonly input: CreateLlmClientInput) {}

  async generateObject<TOutput>(request: LlmGenerateRequest<Record<string, unknown>>): Promise<TOutput> {
    const apiKey = requireApiKey(this.input, 'Anthropic');
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.input.model,
        max_tokens: 4096,
        temperature: this.input.temperature,
        output_config: {
          format: {
            type: 'json_schema',
            schema: request.schema,
          },
        },
        messages: [{
          role: 'user',
          content: request.prompt,
        }],
      }),
    }, this.input.timeoutMs);
    const payload = await parseJsonResponse(response, 'Anthropic Messages API');
    return readAnthropicStructuredOutput(payload) as TOutput;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new LlmProviderError('LLM provider request failed', {
      url,
      cause: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response: Response, providerName: string): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw new LlmProviderError(`${providerName} returned an error response`, {
      status: response.status,
      body: text.slice(0, 1000),
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new LlmProviderError(`${providerName} response was not valid JSON`, {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseGeneratedObject(text: string, providerName: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new LlmProviderError(`${providerName} did not return a valid structured JSON object`, {
      cause: error instanceof Error ? error.message : String(error),
      output: text.slice(0, 1000),
    });
  }
}

function readOpenAiOutputText(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new LlmProviderError('OpenAI response payload must be an object');
  }
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text;
  }
  const output = payload.output;
  if (!Array.isArray(output)) {
    throw new LlmProviderError('OpenAI response is missing output text');
  }
  const textParts = output.flatMap((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      return [];
    }
    return item.content.flatMap((content) =>
      isRecord(content) && typeof content.text === 'string'
        ? [content.text]
        : []
    );
  });
  const text = textParts.join('\n').trim();
  if (!text) {
    throw new LlmProviderError('OpenAI response output text was empty');
  }
  return text;
}

function readAnthropicStructuredOutput(payload: unknown): unknown {
  if (!isRecord(payload)) {
    throw new LlmProviderError('Anthropic response payload must be an object');
  }
  if (payload.parsed_output !== undefined) {
    return payload.parsed_output;
  }
  return parseGeneratedObject(readAnthropicOutputText(payload), 'Anthropic Messages API');
}

function readAnthropicOutputText(payload: unknown): string {
  if (!isRecord(payload) || !Array.isArray(payload.content)) {
    throw new LlmProviderError('Anthropic response is missing content text');
  }
  const text = payload.content
    .flatMap((entry) => isRecord(entry) && typeof entry.text === 'string' ? [entry.text] : [])
    .join('\n')
    .trim();
  if (!text) {
    throw new LlmProviderError('Anthropic response content text was empty');
  }
  return text;
}

function requireApiKey(input: CreateLlmClientInput, providerName: string): string {
  if (!input.apiKey?.trim()) {
    throw new LlmProviderError(`${providerName} provider requires llm.apiKey`);
  }
  return input.apiKey;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
