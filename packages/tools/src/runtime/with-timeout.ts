import { ToolExecutionContractError } from '../contracts.ts';
import { createAbortAwareSignal } from './abort-aware-adapter.ts';

export interface WithTimeoutInput<T> {
  execute: (signal: AbortSignal) => Promise<T>;
  timeoutMs: number;
  toolName: string;
  parentSignal?: AbortSignal;
}

export async function withToolTimeout<T>(input: WithTimeoutInput<T>): Promise<T> {
  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;
  const parentSignal = createAbortAwareSignal(input.parentSignal, input.toolName);
  parentSignal.signal.addEventListener('abort', () => {
    controller.abort(parentSignal.signal.reason);
  }, { once: true });

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
    parentSignal.dispose();
  }
}
