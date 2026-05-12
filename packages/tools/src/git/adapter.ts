import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.js';

const execFileAsync = promisify(execFile);

export interface GitTool {
  status: (options?: { cwd?: string; signal?: AbortSignal }) => Promise<string>;
  diff: (args?: { cwd?: string; staged?: boolean; signal?: AbortSignal }) => Promise<string>;
  currentBranch: (options?: { cwd?: string; signal?: AbortSignal }) => Promise<string>;
}

export interface GitToolAdapter extends UnifiedToolAdapter {
  readonly name: 'git';
  readonly tool: GitTool;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'undefined') {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new Error('staged must be a boolean');
  }

  return value;
}

export function createGitToolAdapter(): GitToolAdapter {
  const tool: GitTool = {
    status: async (options) => {
      const { stdout } = await execFileAsync('git', ['status', '--short'], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        signal: options?.signal,
      });
      return stdout.trim();
    },
    diff: async (args) => {
      const commandArgs = args?.staged ? ['diff', '--staged'] : ['diff'];
      const { stdout } = await execFileAsync('git', commandArgs, {
        ...(args?.cwd ? { cwd: args.cwd } : {}),
        signal: args?.signal,
      });
      return stdout;
    },
    currentBranch: async (options) => {
      const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
        ...(options?.cwd ? { cwd: options.cwd } : {}),
        signal: options?.signal,
      });
      return stdout.trim();
    },
  };

  const execute = async (
    request: UnifiedToolRequest,
    options: ToolExecutionOptions,
  ): Promise<unknown> => {
    const cwd = options.executionContext.workspaceRoot;
    switch (request.toolName) {
      case 'git_status':
        return tool.status({ cwd, ...(options.signal ? { signal: options.signal } : {}) });
      case 'git_diff': {
        const isStaged = asBoolean(request.input.staged, false);
        return tool.diff({
          cwd,
          staged: isStaged,
          ...(options?.signal ? { signal: options.signal } : {}),
        });
      }
      case 'git_current_branch':
        return tool.currentBranch({ cwd, ...(options.signal ? { signal: options.signal } : {}) });
      default:
        throw new Error(`Unsupported git tool: ${request.toolName}`);
    }
  };

  return {
    name: 'git',
    tool,
    canHandle: (toolName) =>
      toolName === 'git_status' || toolName === 'git_diff' || toolName === 'git_current_branch',
    execute,
  };
}
