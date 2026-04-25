import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';
import type { ToolPolicyAdapter } from '../policy/adapter.ts';
import type { ShellExecResult } from '../shell/adapter.ts';
import { createShellToolAdapter } from '../shell/adapter.ts';

export interface TestingToolAdapter extends UnifiedToolAdapter {
  readonly name: 'testing';
}

export function createTestingToolAdapter(policy: ToolPolicyAdapter): TestingToolAdapter {
  const shell = createShellToolAdapter(policy);

  return {
    name: 'testing',
    canHandle: (toolName) => toolName === 'testing_run',
    execute: async (
      request: UnifiedToolRequest,
      options?: ToolExecutionOptions,
    ): Promise<ShellExecResult> => {
      const command = request.input.command;
      if (typeof command !== 'string' || command.length === 0) {
        throw new Error('Field command must be a non-empty string');
      }
      const args = Array.isArray(request.input.args)
        ? request.input.args.filter((entry): entry is string => typeof entry === 'string')
        : [];

      return shell.execute(
        {
          toolName: 'shell_exec',
          input: {
            command,
            args,
            timeoutMs: request.input.timeoutMs,
          },
        },
        options,
      ) as Promise<ShellExecResult>;
    },
  };
}
