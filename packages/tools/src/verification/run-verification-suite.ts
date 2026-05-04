import { spawn } from 'node:child_process';

export type VerificationGateName = 'build' | 'lint' | 'typecheck' | 'test' | 'security';

export interface VerificationGateCommand {
  gate: VerificationGateName;
  command: string;
  args: string[];
}

export interface VerificationGateEvidence {
  gate: VerificationGateName;
  command: string;
  args: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  exitCode: number;
  output: string;
}

export interface VerificationSuiteResult {
  ok: boolean;
  evidences: VerificationGateEvidence[];
  failedGate?: VerificationGateName;
}

export interface RunVerificationSuiteInput {
  workspacePath: string;
  signal?: AbortSignal;
  commands?: VerificationGateCommand[];
}

const DEFAULT_COMMANDS: VerificationGateCommand[] = [
  { gate: 'build', command: 'pnpm', args: ['run', 'build'] },
  { gate: 'lint', command: 'pnpm', args: ['run', 'lint'] },
  { gate: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'] },
  { gate: 'test', command: 'pnpm', args: ['run', 'test'] },
  { gate: 'security', command: 'pnpm', args: ['run', 'security'] },
];

async function runCommand(workspacePath: string, entry: VerificationGateCommand, signal?: AbortSignal): Promise<VerificationGateEvidence> {
  const startedAtMs = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(entry.command, entry.args, {
      cwd: workspacePath,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });

    child.on('error', reject);
    child.on('close', (exitCode) => {
      const finishedAtMs = Date.now();
      resolve({
        gate: entry.gate,
        command: entry.command,
        args: entry.args,
        startedAt: new Date(startedAtMs).toISOString(),
        finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAtMs,
        exitCode: exitCode ?? 1,
        output,
      });
    });
  });
}

export async function runVerificationSuite(input: RunVerificationSuiteInput): Promise<VerificationSuiteResult> {
  const commands = input.commands ?? DEFAULT_COMMANDS;
  const evidences: VerificationGateEvidence[] = [];

  for (const command of commands) {
    const evidence = await runCommand(input.workspacePath, command, input.signal);
    evidences.push(evidence);
    if (evidence.exitCode !== 0) {
      return { ok: false, evidences, failedGate: command.gate };
    }
  }

  return { ok: true, evidences };
}
