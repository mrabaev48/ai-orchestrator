import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface EnsureLocalBranchInput {
  branchName: string;
  signal?: AbortSignal;
}

export interface EnsureLocalBranchResult {
  created: boolean;
}

async function hasLocalBranch(branchName: string, signal?: AbortSignal): Promise<boolean> {
  const hasBranch = await execFileAsync('git', ['show-ref', '--verify', `refs/heads/${branchName}`], {
    signal,
    encoding: 'utf8',
  }).then(
    () => true,
    () => false,
  );

  return hasBranch;
}

export async function ensureLocalBranch(input: EnsureLocalBranchInput): Promise<EnsureLocalBranchResult> {
  const hasExistingBranch = await hasLocalBranch(input.branchName, input.signal);

  if (hasExistingBranch) {
    await execFileAsync('git', ['checkout', input.branchName], { signal: input.signal });
    return { created: false };
  }

  await execFileAsync('git', ['checkout', '-b', input.branchName], { signal: input.signal });
  return { created: true };
}
