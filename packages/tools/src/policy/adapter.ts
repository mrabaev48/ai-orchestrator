import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { SafetyViolationError } from '@ai-orchestrator/shared';

export type SafeWriteMode =
  | 'read-only'
  | 'propose-only'
  | 'sandbox-write'
  | 'workspace-write'
  | 'protected-write';

export interface ToolPolicyAdapter {
  assertWriteAllowed: (targetPath: string) => string;
  assertWorkspaceAllowed: (workspaceRoot: string) => string;
  assertCommandAllowed: (command: string, args?: readonly string[]) => string;
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

  const assertWorkspaceAllowed = (workspaceRoot: string): string => {
    const resolved = normalizePath(workspaceRoot);
    const hasAllowedWorkspacePath = normalizedScopes.some((basePath) => isWithinPathScope(resolved, basePath));
    if (!hasAllowedWorkspacePath) {
      throw new SafetyViolationError(`Workspace outside allowed scope is forbidden: ${resolved}`);
    }

    return resolved;
  };

  return {
    assertWorkspaceAllowed,
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
    assertCommandAllowed: (command: string, args: readonly string[] = []): string => {
      if (!allowedCommands.has(command)) {
        throw new SafetyViolationError(`Shell command is not allowlisted: ${command}`);
      }

      assertCommandArgsAllowed(command, args);
      return command;
    },
  };
}

const QUALITY_GATE_STAGES = new Set(['build', 'lint', 'typecheck', 'test']);

function assertCommandArgsAllowed(command: string, args: readonly string[]): void {
  if (command === 'git') {
    assertGitArgsAllowed(args);
    return;
  }

  if (command === 'npm' || command === 'pnpm') {
    assertPackageManagerArgsAllowed(command, args);
  }
}

function assertGitArgsAllowed(args: readonly string[]): void {
  const signature = args.join('\0');
  const allowedSignatures = new Set([
    'status',
    'status\0--short',
    'status\0--porcelain',
    'diff',
    'diff\0--staged',
    'branch\0--show-current',
  ]);

  if (!allowedSignatures.has(signature)) {
    throw new SafetyViolationError(`Shell command arguments are not allowed for git: ${args.join(' ')}`);
  }
}

function assertPackageManagerArgsAllowed(command: 'npm' | 'pnpm', args: readonly string[]): void {
  if (args.length === 2 && args[0] === 'run' && QUALITY_GATE_STAGES.has(args[1] ?? '')) {
    return;
  }

  throw new SafetyViolationError(`Shell command arguments are not allowed for ${command}: ${args.join(' ')}`);
}
