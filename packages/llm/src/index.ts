export interface LlmGenerateRequest<TSchema> {
  schemaName: string;
  prompt: string;
  schema: TSchema;
}

export interface LlmClient {
  generateObject: <TOutput>(request: LlmGenerateRequest<Record<string, unknown>>) => Promise<TOutput>;
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
