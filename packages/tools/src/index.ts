import {
  ToolExecutionContractError,
  type ToolDeterminismMetadata,
  type ToolEvidenceStore,
  type UnifiedToolAdapter,
  type UnifiedToolRequest,
  type UnifiedToolResult,
} from './contracts.ts';
import path from 'node:path';
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
import { withToolTimeout } from './runtime/with-timeout.ts';
import { validateToolInput, validateToolOutput } from './contracts/input-output-schemas.ts';
import { normalizeToolError } from './errors/tool-error-envelope.ts';

export type { ToolExecutionRecord, ToolAdapterName } from './contracts.ts';
export type { FileSystemTool, GitTool, TypeScriptTool };
export type { SafeWriteMode } from './policy/adapter.ts';

export interface ToolSet {
  fileSystem: FileSystemTool;
  git: GitTool;
  typeScript: TypeScriptTool;
  execute: (request: UnifiedToolRequest, options?: { signal?: AbortSignal }) => Promise<UnifiedToolResult>;
  evidence: ToolEvidenceStore;
}

const TOOL_METADATA: Record<string, ToolDeterminismMetadata> = {
  file_read: { deterministic: true, sideEffectRisk: 'none' },
  file_list: { deterministic: true, sideEffectRisk: 'none' },
  file_exists: { deterministic: true, sideEffectRisk: 'none' },
  file_write: { deterministic: false, sideEffectRisk: 'high' },
  git_status: { deterministic: false, sideEffectRisk: 'none' },
  git_diff: { deterministic: false, sideEffectRisk: 'none' },
  git_current_branch: { deterministic: false, sideEffectRisk: 'none' },
  typescript_check: { deterministic: false, sideEffectRisk: 'none' },
  typescript_diagnostics: { deterministic: false, sideEffectRisk: 'none' },
  shell_exec: { deterministic: false, sideEffectRisk: 'high' },
  testing_run: { deterministic: false, sideEffectRisk: 'low' },
  diff_workspace: { deterministic: false, sideEffectRisk: 'none' },
  search_repo: { deterministic: true, sideEffectRisk: 'none' },
};

const DEFAULT_ALLOWED_SHELL_COMMANDS = ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'] as const;
const DEFAULT_PROTECTED_WRITE_PATHS = [
  'package.json',
  'pnpm-lock.yaml',
  'package-lock.json',
  '.github',
  '.env',
] as const;

type CreateLocalToolSetInput = string[] | ToolPolicyConfig;

function resolveToolPolicyConfig(input: CreateLocalToolSetInput): ToolPolicyConfig {
  if (Array.isArray(input)) {
    return {
      allowedWritePaths: input,
      allowedShellCommands: [...DEFAULT_ALLOWED_SHELL_COMMANDS],
      writeMode: 'workspace-write',
      protectedWritePaths: DEFAULT_PROTECTED_WRITE_PATHS.map((entry) => path.resolve(process.cwd(), entry)),
      maxModifiedFiles: 200,
    };
  }

  return {
    ...input,
    writeMode: input.writeMode ?? 'workspace-write',
    protectedWritePaths: input.protectedWritePaths ?? DEFAULT_PROTECTED_WRITE_PATHS.map((entry) => path.resolve(process.cwd(), entry)),
    maxModifiedFiles: input.maxModifiedFiles ?? 200,
  };
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
  ): Promise<UnifiedToolResult> => {
    validateToolInput(request.toolName, request.input);
    const adapter = adapters.find((candidate) => candidate.canHandle(request.toolName));
    if (!adapter) {
      throw new ToolExecutionContractError({
        category: 'unsupported',
        retriable: false,
        code: 'TOOL_UNSUPPORTED',
        message: `Unsupported tool request: ${request.toolName}`,
        details: { toolName: request.toolName },
      });
    }
    const determinism = TOOL_METADATA[request.toolName] ?? { deterministic: false, sideEffectRisk: 'low' };

    const start = Date.now();
    const timeoutMs =
      typeof request.input.timeoutMs === 'number' && Number.isFinite(request.input.timeoutMs)
        ? Math.max(1, request.input.timeoutMs)
        : 10_000;

    try {
      const result = await withToolTimeout({
        execute: async (signal) => adapter.execute(request, { ...options, signal }),
        timeoutMs,
        toolName: request.toolName,
        ...(options?.signal ? { parentSignal: options.signal } : {}),
      });
      validateToolOutput(request.toolName, result);
      evidenceAdapter.store.add({
        adapter: adapter.name,
        toolName: request.toolName,
        success: true,
        durationMs: Date.now() - start,
        createdAt: new Date().toISOString(),
      });
      return { ok: true, toolName: request.toolName, output: result, determinism };
    } catch (error) {
      const envelope = normalizeToolError(error, 'TOOL_EXECUTION_FAILED');
      evidenceAdapter.store.add({
        adapter: adapter.name,
        toolName: request.toolName,
        success: false,
        durationMs: Date.now() - start,
        createdAt: new Date().toISOString(),
        error: envelope.message,
      });
      return { ok: false, toolName: request.toolName, error: envelope, determinism };
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

export * from './verification/run-verification-suite.ts';
