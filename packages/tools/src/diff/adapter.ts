import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';
import type { GitTool } from '../git/adapter.ts';

export interface DiffToolAdapter extends UnifiedToolAdapter {
  readonly name: 'diff';
}

export function createDiffToolAdapter(gitTool: GitTool): DiffToolAdapter {
  return {
    name: 'diff',
    canHandle: (toolName) => toolName === 'diff_workspace',
    execute: async (request: UnifiedToolRequest, options?: ToolExecutionOptions): Promise<string> => {
      const isStaged = typeof request.input.staged === 'boolean' ? request.input.staged : false;
      return gitTool.diff({
        staged: isStaged,
        ...(options?.signal ? { signal: options.signal } : {}),
      });
    },
  };
}
