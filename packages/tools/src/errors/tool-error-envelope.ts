import { ToolExecutionContractError, type ToolErrorEnvelope } from '../contracts.ts';

function isAbortLikeError(error: unknown): error is { name?: string; message?: string } {
  return typeof error === 'object' && error !== null && 'name' in error;
}

function messageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
    return String(error);
  }
  return 'Unknown tool execution error';
}

export function normalizeToolError(error: unknown, fallbackCode: string): ToolErrorEnvelope {
  if (error instanceof ToolExecutionContractError) {
    return error.envelope;
  }

  if (isAbortLikeError(error) && error.name === 'AbortError') {
    return {
      category: 'cancelled',
      retriable: false,
      code: 'TOOL_CANCELLED',
      message: messageFromUnknown(error),
    };
  }

  return {
    category: 'execution',
    retriable: true,
    code: fallbackCode,
    message: messageFromUnknown(error),
  };
}
