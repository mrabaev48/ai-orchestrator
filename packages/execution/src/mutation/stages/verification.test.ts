import assert from 'node:assert/strict';
import test from 'node:test';
import { executeVerificationStage } from './verification.ts';
import type { RepoMutationPipelineContext } from '../../repo-mutation-pipeline.ts';

const context: RepoMutationPipelineContext = {
  runId: 'run-28',
  taskId: 'task-28',
  workspacePath: '/tmp/workspace',
  metadata: {},
};

void test('verification: success path aggregates evidence metadata', async () => {
  const result = await executeVerificationStage({
    context,
    signal: new AbortController().signal,
    runSuite: async () => ({
      ok: true,
      evidences: [
        { gate: 'lint', command: 'pnpm', args: ['run', 'lint'], startedAt: '', finishedAt: '', durationMs: 100, exitCode: 0, output: '' },
        { gate: 'typecheck', command: 'pnpm', args: ['run', 'typecheck'], startedAt: '', finishedAt: '', durationMs: 200, exitCode: 0, output: '' },
      ],
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.notes, 'verification_suite_passed');
  assert.equal(result.metadata?.executedGates, 'lint,typecheck');
  assert.equal(result.metadata?.totalDurationMs, '300');
});

void test('verification: failure path returns structured non-retriable gate failure', async () => {
  const result = await executeVerificationStage({
    context,
    signal: new AbortController().signal,
    runSuite: async () => ({
      ok: false,
      failedGate: 'test',
      evidences: [
        { gate: 'lint', command: 'pnpm', args: ['run', 'lint'], startedAt: '', finishedAt: '', durationMs: 100, exitCode: 0, output: '' },
        { gate: 'test', command: 'pnpm', args: ['run', 'test'], startedAt: '', finishedAt: '', durationMs: 200, exitCode: 1, output: 'failed' },
      ],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'VERIFICATION_GATE_FAILED');
  assert.equal(result.failure?.retriable, false);
  assert.equal(result.metadata?.failedGate, 'test');
});

void test('verification: regression unexpected suite exception remains retriable', async () => {
  const result = await executeVerificationStage({
    context,
    signal: new AbortController().signal,
    runSuite: async () => {
      throw new Error('runner crashed');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.failure?.code, 'VERIFICATION_STAGE_FAILED');
  assert.equal(result.failure?.retriable, true);
});
