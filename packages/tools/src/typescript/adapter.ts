import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';

const execFileAsync = promisify(execFile);

export interface TypeScriptTool {
  check: (options?: { signal?: AbortSignal }) => Promise<{ ok: boolean; diagnostics: string[] }>;
  diagnostics: (options?: { signal?: AbortSignal }) => Promise<string[]>;
}

export interface TypeScriptToolAdapter extends UnifiedToolAdapter {
  readonly name: 'typescript';
  readonly tool: TypeScriptTool;
}

export function createTypeScriptToolAdapter(): TypeScriptToolAdapter {
  const typeScriptCheck = async (
    options?: { signal?: AbortSignal },
  ): Promise<{ ok: boolean; diagnostics: string[] }> => {
    try {
      await execFileAsync('npm', ['run', 'typecheck'], { signal: options?.signal });
      return { ok: true, diagnostics: [] };
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
      return { ok: false, diagnostics: stderr.split('\n').filter(Boolean) };
    }
  };

  const tool: TypeScriptTool = {
    check: typeScriptCheck,
    diagnostics: async (options) => {
      const result = await typeScriptCheck(options);
      return result.diagnostics;
    },
  };

  const execute = async (
    request: UnifiedToolRequest,
    options?: ToolExecutionOptions,
  ): Promise<unknown> => {
    switch (request.toolName) {
      case 'typescript_check':
        return tool.check(options);
      case 'typescript_diagnostics':
        return tool.diagnostics(options);
      default:
        throw new Error(`Unsupported typescript tool: ${request.toolName}`);
    }
  };

  return {
    name: 'typescript',
    tool,
    canHandle: (toolName) => toolName === 'typescript_check' || toolName === 'typescript_diagnostics',
    execute,
  };
}
