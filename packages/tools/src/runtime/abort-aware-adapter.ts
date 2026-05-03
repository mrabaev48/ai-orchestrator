import { ToolExecutionContractError } from '../contracts.ts';

export interface AbortAwareSignal {
  signal: AbortSignal;
  dispose: () => void;
}

export function createAbortAwareSignal(parentSignal: AbortSignal | undefined, toolName: string): AbortAwareSignal {
  const controller = new AbortController();

  if (!parentSignal) {
    return { signal: controller.signal, dispose: () => undefined };
  }

  if (parentSignal.aborted) {
    throw new ToolExecutionContractError({
      category: 'cancelled',
      retriable: false,
      code: 'TOOL_CANCELLED',
      message: `Tool ${toolName} cancelled before execution`,
    });
  }

  const onAbort = () => {
    controller.abort(parentSignal.reason);
  };

  parentSignal.addEventListener('abort', onAbort, { once: true });

  return {
    signal: controller.signal,
    dispose: () => {
      parentSignal.removeEventListener('abort', onAbort);
    },
  };
}
