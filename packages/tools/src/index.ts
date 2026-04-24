import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';

import { SafetyViolationError } from '../../shared/src/index.ts';

const execFileAsync = promisify(execFile);

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

export interface GitTool {
  status: (options?: { signal?: AbortSignal }) => Promise<string>;
  diff: (args?: { staged?: boolean; signal?: AbortSignal }) => Promise<string>;
  currentBranch: (options?: { signal?: AbortSignal }) => Promise<string>;
}

export interface TypeScriptTool {
  check: (options?: { signal?: AbortSignal }) => Promise<{ ok: boolean; diagnostics: string[] }>;
  diagnostics: (options?: { signal?: AbortSignal }) => Promise<string[]>;
}

export interface ToolSet {
  fileSystem: FileSystemTool;
  git: GitTool;
  typeScript: TypeScriptTool;
}

export function createLocalToolSet(allowedWritePaths: string[]): ToolSet {
  const normalizePath = (targetPath: string): string => {
    const resolved = path.resolve(targetPath);
    const existingPath = existsSync(resolved) ? resolved : path.dirname(resolved);

    try {
      const realBase = realpathSync(existingPath);
      const relativeSuffix = path.relative(existingPath, resolved);
      return relativeSuffix ? path.join(realBase, relativeSuffix) : realBase;
    } catch {
      return resolved;
    }
  };

  const guardPath = (targetPath: string): string => {
    const resolved = normalizePath(targetPath);
    const hasAllowedWritePath = allowedWritePaths.some((basePath) =>
      resolved.startsWith(normalizePath(basePath)),
    );
    if (!hasAllowedWritePath) {
      throw new SafetyViolationError(`Write outside allowed scope is forbidden: ${resolved}`);
    }

    return resolved;
  };

  const assertNotAborted = (signal?: AbortSignal): void => {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Operation aborted');
    }
  };

  const typeScriptCheck = async (
    options?: { signal?: AbortSignal },
  ): Promise<{ ok: boolean; diagnostics: string[] }> => {
    assertNotAborted(options?.signal);
    try {
      await execFileAsync('npm', ['run', 'typecheck'], { signal: options?.signal });
      return { ok: true, diagnostics: [] };
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
      return { ok: false, diagnostics: stderr.split('\n').filter(Boolean) };
    }
  };

  return {
    fileSystem: {
      readFile: async (filePath, options) =>
        fs.readFile(path.resolve(filePath), { encoding: 'utf8', signal: options?.signal }),
      writeFile: async (filePath, content, options) => {
        assertNotAborted(options?.signal);
        const guardedPath = guardPath(filePath);
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
    },
    git: {
      status: async (options) => {
        assertNotAborted(options?.signal);
        const { stdout } = await execFileAsync('git', ['status', '--short'], {
          signal: options?.signal,
        });
        return stdout.trim();
      },
      diff: async (args) => {
        assertNotAborted(args?.signal);
        const commandArgs = args?.staged ? ['diff', '--staged'] : ['diff'];
        const { stdout } = await execFileAsync('git', commandArgs, { signal: args?.signal });
        return stdout;
      },
      currentBranch: async (options) => {
        assertNotAborted(options?.signal);
        const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
          signal: options?.signal,
        });
        return stdout.trim();
      },
    },
    typeScript: {
      check: typeScriptCheck,
      diagnostics: async (options) => {
        const result = await typeScriptCheck(options);
        return result.diagnostics;
      },
    },
  };
}
