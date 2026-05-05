import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import type {
  ToolExecutionOptions,
  UnifiedToolAdapter,
  UnifiedToolRequest,
} from '../contracts.js';
import type { ToolPolicyAdapter } from '../policy/adapter.js';

const execFileAsync = promisify(execFile);
const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage']);

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
      try {
        const { stdout } = await execFileAsync(command, ['--line-number', pattern, cwd], {
          signal: options?.signal,
        });
        return stdout.split('\n').filter(Boolean);
      } catch (error) {
        if (isNoMatchError(error)) {
          return splitSearchOutput(error.stdout);
        }

        if (isMissingExecutableError(error)) {
          return searchWithNode(pattern, cwd, options?.signal);
        }

        throw error;
      }
    },
  };
}

function isNoMatchError(error: unknown): error is { code: 1; stdout?: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 1;
}

function isMissingExecutableError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

function splitSearchOutput(output: string | undefined): string[] {
  return (output ?? '').split('\n').filter(Boolean);
}

async function searchWithNode(pattern: string, cwd: string, signal?: AbortSignal): Promise<string[]> {
  const matcher = new RegExp(pattern);
  const results: string[] = [];
  await searchDirectory(path.resolve(cwd), matcher, results, signal);
  return results;
}

async function searchDirectory(
  directoryPath: string,
  matcher: RegExp,
  results: string[],
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  const entries = await readdir(directoryPath, { withFileTypes: true });
  for (const entry of entries) {
    throwIfAborted(signal);

    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        await searchDirectory(path.join(directoryPath, entry.name), matcher, results, signal);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    await searchFile(path.join(directoryPath, entry.name), matcher, results, signal);
  }
}

async function searchFile(filePath: string, matcher: RegExp, results: string[], signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  let content: string;
  try {
    content = await readFile(filePath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    if (matcher.test(line)) {
      results.push(`${filePath}:${index + 1}:${line}`);
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Search cancelled');
  }
}
