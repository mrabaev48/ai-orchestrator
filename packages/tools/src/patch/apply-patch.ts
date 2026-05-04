import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ApplyPatchInput {
  workspacePath: string;
  patchText: string;
  signal?: AbortSignal;
}

export interface ApplyPatchDiagnostics {
  changedFiles: string[];
  command: string;
  stderr?: string;
  stdout?: string;
}

export class ApplyPatchError extends Error {
  readonly code: 'PATCH_TEXT_EMPTY' | 'PATCH_APPLY_FAILED' | 'PATCH_CANCELLED';
  readonly diagnostics: ApplyPatchDiagnostics;

  constructor(code: ApplyPatchError['code'], message: string, diagnostics: ApplyPatchDiagnostics, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApplyPatchError';
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

function parseChangedFiles(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

export async function applyPatch(input: ApplyPatchInput): Promise<ApplyPatchDiagnostics> {
  const patchText = input.patchText.trim();
  const baseDiagnostics: ApplyPatchDiagnostics = {
    changedFiles: [],
    command: 'git apply --whitespace=nowarn --recount --verbose --index --apply <patch-file>',
  };

  if (patchText.length === 0) {
    throw new ApplyPatchError('PATCH_TEXT_EMPTY', 'Patch text is empty', baseDiagnostics);
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'apply-patch-'));
  const patchFilePath = path.join(tempDir, 'change.patch');

  try {
    await writeFile(patchFilePath, patchText, 'utf8');

    try {
      const applyResult = await execFileAsync(
        'git',
        ['apply', '--whitespace=nowarn', '--recount', '--verbose', '--index', '--apply', patchFilePath],
        { cwd: input.workspacePath, signal: input.signal },
      );

      const listResult = await execFileAsync('git', ['diff', '--name-only', '--cached'], {
        cwd: input.workspacePath,
        signal: input.signal,
      });

      const stdout = applyResult.stdout.trim();
      const stderr = applyResult.stderr.trim();

      return {
        ...baseDiagnostics,
        changedFiles: parseChangedFiles(listResult.stdout),
        ...(stdout.length > 0 ? { stdout } : {}),
        ...(stderr.length > 0 ? { stderr } : {}),
      };
    } catch (error) {
      const stdout = typeof error === 'object' && error !== null && 'stdout' in error ? ((error as { stdout?: string }).stdout ?? '').trim() : '';
      const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? ((error as { stderr?: string }).stderr ?? '').trim() : '';

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApplyPatchError(
          'PATCH_CANCELLED',
          'Patch apply cancelled',
          {
            ...baseDiagnostics,
            ...(stdout.length > 0 ? { stdout } : {}),
            ...(stderr.length > 0 ? { stderr } : {}),
          },
          { cause: error },
        );
      }

      throw new ApplyPatchError(
        'PATCH_APPLY_FAILED',
        'Failed to apply patch',
        {
          ...baseDiagnostics,
          ...(stdout.length > 0 ? { stdout } : {}),
          ...(stderr.length > 0 ? { stderr } : {}),
        },
        { cause: error },
      );
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
