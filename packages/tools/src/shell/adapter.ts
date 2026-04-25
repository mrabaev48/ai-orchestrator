import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';
import type { ToolPolicyAdapter } from '../policy/adapter.ts';

const execFileAsync = promisify(execFile);

export interface ShellExecResult {
  ok: boolean;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellToolAdapter extends UnifiedToolAdapter {
  readonly name: 'shell';
}

function asStringArray(value: unknown, field: string): string[] {
  if (typeof value === 'undefined') {
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Field ${field} must be a string[]`);
  }
  return value as string[];
}

export function createShellToolAdapter(policy: ToolPolicyAdapter): ShellToolAdapter {
  return {
    name: 'shell',
    canHandle: (toolName) => toolName === 'shell_exec',
    execute: async (request: UnifiedToolRequest, options?: ToolExecutionOptions): Promise<ShellExecResult> => {
      const command = request.input.command;
      if (typeof command !== 'string' || command.length === 0) {
        throw new Error('Field command must be a non-empty string');
      }
      const allowlistedCommand = policy.assertCommandAllowed(command);
      const args = asStringArray(request.input.args, 'args');
      const timeoutMs =
        typeof request.input.timeoutMs === 'number' && Number.isFinite(request.input.timeoutMs)
          ? request.input.timeoutMs
          : 10_000;

      try {
        const { stdout, stderr } = await execFileAsync(allowlistedCommand, args, {
          signal: options?.signal,
          timeout: timeoutMs,
          encoding: 'utf8',
        });
        return { ok: true, command: allowlistedCommand, args, stdout, stderr, exitCode: 0 };
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string; code?: number | string };
        return {
          ok: false,
          command: allowlistedCommand,
          args,
          stdout: failure.stdout ?? '',
          stderr: failure.stderr ?? String(error),
          exitCode: typeof failure.code === 'number' ? failure.code : -1,
        };
      }
    },
  };
}
