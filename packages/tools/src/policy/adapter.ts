import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { SafetyViolationError } from '../../../shared/src/index.ts';

export interface ToolPolicyAdapter {
  assertWriteAllowed: (targetPath: string) => string;
  assertCommandAllowed: (command: string) => string;
}

export interface ToolPolicyConfig {
  allowedWritePaths: string[];
  allowedShellCommands: string[];
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
  const allowedCommands = new Set(
    config.allowedShellCommands.map((command) => command.trim()).filter(Boolean),
  );

  return {
    assertWriteAllowed: (targetPath: string): string => {
      const resolved = normalizePath(targetPath);
      const hasAllowedWritePath = normalizedScopes.some((basePath) => resolved.startsWith(basePath));
      if (!hasAllowedWritePath) {
        throw new SafetyViolationError(`Write outside allowed scope is forbidden: ${resolved}`);
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
