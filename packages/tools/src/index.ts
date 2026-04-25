import type { ToolEvidenceStore, UnifiedToolAdapter, UnifiedToolRequest } from './contracts.ts';
import { createEvidenceToolAdapter } from './evidence/adapter.ts';
import {
  createFileSystemToolAdapter,
  type FileSystemTool,
} from './filesystem/adapter.ts';
import { createGitToolAdapter, type GitTool } from './git/adapter.ts';
import { createToolPolicyAdapter, type ToolPolicyConfig } from './policy/adapter.ts';
import { createTypeScriptToolAdapter, type TypeScriptTool } from './typescript/adapter.ts';
import { createShellToolAdapter } from './shell/adapter.ts';
import { createTestingToolAdapter } from './testing/adapter.ts';
import { createDiffToolAdapter } from './diff/adapter.ts';
import { createSearchToolAdapter } from './search/adapter.ts';

export type { ToolExecutionRecord, ToolAdapterName } from './contracts.ts';
export type { FileSystemTool, GitTool, TypeScriptTool };

export interface ToolSet {
  fileSystem: FileSystemTool;
  git: GitTool;
  typeScript: TypeScriptTool;
  execute: (request: UnifiedToolRequest, options?: { signal?: AbortSignal }) => Promise<unknown>;
  evidence: ToolEvidenceStore;
}

const DEFAULT_ALLOWED_SHELL_COMMANDS = ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'] as const;

type CreateLocalToolSetInput = string[] | ToolPolicyConfig;

function resolveToolPolicyConfig(input: CreateLocalToolSetInput): ToolPolicyConfig {
  if (Array.isArray(input)) {
    return {
      allowedWritePaths: input,
      allowedShellCommands: [...DEFAULT_ALLOWED_SHELL_COMMANDS],
    };
  }

  return input;
}

export function createLocalToolSet(input: CreateLocalToolSetInput): ToolSet {
  const policyConfig = resolveToolPolicyConfig(input);
  const policyAdapter = createToolPolicyAdapter(policyConfig);
  const fileSystemAdapter = createFileSystemToolAdapter(policyAdapter);
  const gitAdapter = createGitToolAdapter();
  const typeScriptAdapter = createTypeScriptToolAdapter();
  const shellAdapter = createShellToolAdapter(policyAdapter);
  const testingAdapter = createTestingToolAdapter(policyAdapter);
  const diffAdapter = createDiffToolAdapter(gitAdapter.tool);
  const searchAdapter = createSearchToolAdapter(policyAdapter);
  const evidenceAdapter = createEvidenceToolAdapter();

  const adapters: UnifiedToolAdapter[] = [
    fileSystemAdapter,
    gitAdapter,
    typeScriptAdapter,
    shellAdapter,
    testingAdapter,
    diffAdapter,
    searchAdapter,
  ];

  const execute = async (
    request: UnifiedToolRequest,
    options?: { signal?: AbortSignal },
  ): Promise<unknown> => {
    const adapter = adapters.find((candidate) => candidate.canHandle(request.toolName));
    if (!adapter) {
      throw new Error(`Unsupported tool request: ${request.toolName}`);
    }

    const start = Date.now();
    try {
      const result = await adapter.execute(request, options);
      evidenceAdapter.store.add({
        adapter: adapter.name,
        toolName: request.toolName,
        success: true,
        durationMs: Date.now() - start,
        createdAt: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      evidenceAdapter.store.add({
        adapter: adapter.name,
        toolName: request.toolName,
        success: false,
        durationMs: Date.now() - start,
        createdAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  return {
    fileSystem: fileSystemAdapter.tool,
    git: gitAdapter.tool,
    typeScript: typeScriptAdapter.tool,
    execute,
    evidence: evidenceAdapter.store,
  };
}
