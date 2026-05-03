import { ToolExecutionContractError } from '../contracts.ts';

export interface WithTimeoutInput<T> {
  execute: (signal: AbortSignal) => Promise<T>;
  timeoutMs: number;
  toolName: string;
  parentSignal?: AbortSignal;
}

export async function withToolTimeout<T>(input: WithTimeoutInput<T>): Promise<T> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  const parentListener = () => {
    controller.abort(input.parentSignal?.reason);
  };

  if (input.parentSignal) {
    if (input.parentSignal.aborted) {
      throw new ToolExecutionContractError({
        category: 'cancelled',
        retriable: false,
        code: 'TOOL_CANCELLED',
        message: `Tool ${input.toolName} cancelled before execution`,
      });
    }
    input.parentSignal.addEventListener('abort', parentListener, { once: true });
  }

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutError = new ToolExecutionContractError({
          category: 'timeout',
          retriable: true,
          code: 'TOOL_TIMEOUT',
          message: `Tool ${input.toolName} timed out after ${input.timeoutMs}ms`,
          details: { timeoutMs: input.timeoutMs, toolName: input.toolName },
        });
        controller.abort(timeoutError);
        reject(timeoutError);
      }, input.timeoutMs);
    });

    return await Promise.race([input.execute(controller.signal), timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (input.parentSignal) {
      input.parentSignal.removeEventListener('abort', parentListener);
    }
  }
}
