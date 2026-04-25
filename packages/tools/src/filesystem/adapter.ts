import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.ts';
import type { ToolPolicyAdapter } from '../policy/adapter.ts';

export interface FileSystemTool {
  readFile: (filePath: string, options?: { signal?: AbortSignal }) => Promise<string>;
  writeFile: (
    filePath: string,
    content: string,
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  listFiles: (dirPath: string, options?: { signal?: AbortSignal }) => Promise<string[]>;
  exists: (filePath: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
}

export interface FileSystemToolAdapter extends UnifiedToolAdapter {
  readonly name: 'filesystem';
  readonly tool: FileSystemTool;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('Operation aborted');
  }
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Field ${fieldName} must be a non-empty string`);
  }

  return value;
}

export function createFileSystemToolAdapter(policy: ToolPolicyAdapter): FileSystemToolAdapter {
  const tool: FileSystemTool = {
    readFile: async (filePath, options) =>
      fs.readFile(path.resolve(filePath), { encoding: 'utf8', signal: options?.signal }),
    writeFile: async (filePath, content, options) => {
      assertNotAborted(options?.signal);
      const guardedPath = policy.assertWriteAllowed(filePath);
      await fs.mkdir(path.dirname(guardedPath), { recursive: true });
      await fs.writeFile(guardedPath, content, { encoding: 'utf8', signal: options?.signal });
    },
    listFiles: async (dirPath, options) => {
      assertNotAborted(options?.signal);
      const entries = await fs.readdir(path.resolve(dirPath));
      assertNotAborted(options?.signal);
      return entries.sort();
    },
    exists: async (filePath, options) => {
      assertNotAborted(options?.signal);
      return existsSync(path.resolve(filePath));
    },
  };

  const execute = async (
    request: UnifiedToolRequest,
    options?: ToolExecutionOptions,
  ): Promise<unknown> => {
    switch (request.toolName) {
      case 'file_read':
        return tool.readFile(asString(request.input.filePath, 'filePath'), options);
      case 'file_write':
        return tool.writeFile(
          asString(request.input.filePath, 'filePath'),
          asString(request.input.content, 'content'),
          options,
        );
      case 'file_list':
        return tool.listFiles(asString(request.input.dirPath, 'dirPath'), options);
      case 'file_exists':
        return tool.exists(asString(request.input.filePath, 'filePath'), options);
      default:
        throw new Error(`Unsupported filesystem tool: ${request.toolName}`);
    }
  };

  return {
    name: 'filesystem',
    tool,
    canHandle: (toolName) =>
      toolName === 'file_read' ||
      toolName === 'file_write' ||
      toolName === 'file_list' ||
      toolName === 'file_exists',
    execute,
  };
}
