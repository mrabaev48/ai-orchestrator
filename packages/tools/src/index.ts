import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, promises as fs, realpathSync } from 'node:fs';
import path from 'node:path';

import { SafetyViolationError } from '../../shared/src/index.ts';

const execFileAsync = promisify(execFile);

export interface FileSystemTool {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  listFiles: (dirPath: string) => Promise<string[]>;
  exists: (filePath: string) => Promise<boolean>;
}

export interface GitTool {
  status: () => Promise<string>;
  diff: (args?: { staged?: boolean }) => Promise<string>;
  currentBranch: () => Promise<string>;
}

export interface TypeScriptTool {
  check: () => Promise<{ ok: boolean; diagnostics: string[] }>;
  diagnostics: () => Promise<string[]>;
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

  const typeScriptCheck = async (): Promise<{ ok: boolean; diagnostics: string[] }> => {
    try {
      await execFileAsync('npm', ['run', 'typecheck']);
      return { ok: true, diagnostics: [] };
    } catch (error) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
      return { ok: false, diagnostics: stderr.split('\n').filter(Boolean) };
    }
  };

  return {
    fileSystem: {
      readFile: async (filePath) => fs.readFile(path.resolve(filePath), 'utf8'),
      writeFile: async (filePath, content) => {
        const guardedPath = guardPath(filePath);
        await fs.mkdir(path.dirname(guardedPath), { recursive: true });
        await fs.writeFile(guardedPath, content, 'utf8');
      },
      listFiles: async (dirPath) => {
        const entries = await fs.readdir(path.resolve(dirPath));
        return entries.sort();
      },
      exists: async (filePath) => existsSync(path.resolve(filePath)),
    },
    git: {
      status: async () => {
        const { stdout } = await execFileAsync('git', ['status', '--short']);
        return stdout.trim();
      },
      diff: async (args) => {
        const commandArgs = args?.staged ? ['diff', '--staged'] : ['diff'];
        const { stdout } = await execFileAsync('git', commandArgs);
        return stdout;
      },
      currentBranch: async () => {
        const { stdout } = await execFileAsync('git', ['branch', '--show-current']);
        return stdout.trim();
      },
    },
    typeScript: {
      check: typeScriptCheck,
      diagnostics: async () => {
        const result = await typeScriptCheck();
        return result.diagnostics;
      },
    },
  };
}
