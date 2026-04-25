import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';
import type { ToolPolicyAdapter } from '../policy/adapter.ts';

const execFileAsync = promisify(execFile);

export interface SearchToolAdapter extends UnifiedToolAdapter {
  readonly name: 'search';
}

export function createSearchToolAdapter(policy: ToolPolicyAdapter): SearchToolAdapter {
  return {
    name: 'search',
    canHandle: (toolName) => toolName === 'search_repo',
    execute: async (request: UnifiedToolRequest, options?: ToolExecutionOptions): Promise<string[]> => {
      const pattern = request.input.pattern;
      if (typeof pattern !== 'string' || pattern.length === 0) {
        throw new Error('Field pattern must be a non-empty string');
      }
      const cwd = typeof request.input.cwd === 'string' && request.input.cwd.length > 0
        ? request.input.cwd
        : process.cwd();

      const command = policy.assertCommandAllowed('rg');
      const { stdout } = await execFileAsync(command, ['--line-number', pattern, cwd], {
        signal: options?.signal,
      });
      return stdout.split('\n').filter(Boolean);
    },
  };
}
