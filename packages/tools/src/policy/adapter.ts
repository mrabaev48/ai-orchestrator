import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { SafetyViolationError } from '../../../shared/src/index.ts';

export type SafeWriteMode =
  | 'read-only'
  | 'propose-only'
  | 'sandbox-write'
  | 'workspace-write'
  | 'protected-write';

export interface ToolPolicyAdapter {
  assertWriteAllowed: (targetPath: string) => string;
  assertCommandAllowed: (command: string) => string;
}

export interface ToolPolicyConfig {
  allowedWritePaths: string[];
  allowedShellCommands: string[];
  writeMode?: SafeWriteMode;
  protectedWritePaths?: string[];
  maxModifiedFiles?: number;
}

export function createToolPolicyAdapter(config: ToolPolicyConfig): ToolPolicyAdapter {
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

  const normalizedScopes = config.allowedWritePaths.map((scopePath) => normalizePath(scopePath));
  const normalizedProtectedScopes = (config.protectedWritePaths ?? []).map((scopePath) =>
    normalizePath(scopePath)
  );
  const writeMode = config.writeMode ?? 'workspace-write';
  const maxModifiedFiles = config.maxModifiedFiles ?? 200;
  const allowedCommands = new Set(
    config.allowedShellCommands.map((command) => command.trim()).filter(Boolean),
  );
  const modifiedFiles = new Set<string>();

  const isWithinPathScope = (candidatePath: string, basePath: string): boolean =>
    candidatePath === basePath || candidatePath.startsWith(`${basePath}${path.sep}`);

  const isProtectedPath = (candidatePath: string): boolean =>
    normalizedProtectedScopes.some((protectedScope) => isWithinPathScope(candidatePath, protectedScope));

  return {
    assertWriteAllowed: (targetPath: string): string => {
      const resolved = normalizePath(targetPath);
      if (writeMode === 'read-only' || writeMode === 'propose-only') {
        throw new SafetyViolationError(
          `Write is forbidden in ${writeMode} mode: ${resolved}`,
        );
      }

      const hasAllowedWritePath = normalizedScopes.some((basePath) => isWithinPathScope(resolved, basePath));
      if (!hasAllowedWritePath) {
        throw new SafetyViolationError(`Write outside allowed scope is forbidden: ${resolved}`);
      }

      if (writeMode !== 'protected-write' && isProtectedPath(resolved)) {
        throw new SafetyViolationError(
          `Write to protected path requires protected-write mode: ${resolved}`,
        );
      }

      modifiedFiles.add(resolved);
      if (modifiedFiles.size > maxModifiedFiles) {
        throw new SafetyViolationError(
          `Maximum modified files threshold exceeded: ${modifiedFiles.size}/${maxModifiedFiles}`,
        );
      }

      return resolved;
    },
    assertCommandAllowed: (command: string): string => {
      if (!allowedCommands.has(command)) {
        throw new SafetyViolationError(`Shell command is not allowlisted: ${command}`);
      }

      return command;
    },
  };
}
