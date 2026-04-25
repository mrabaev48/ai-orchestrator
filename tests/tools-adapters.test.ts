import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SafetyViolationError } from '../packages/shared/src/index.ts';
import { createLocalToolSet } from '../packages/tools/src/index.ts';

test('tools adapter executes legacy file operations via unified contract', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-'));
  const tools = createLocalToolSet([workspace]);
  const filePath = path.join(workspace, 'notes.txt');

  await tools.execute({
    toolName: 'file_write',
    input: { filePath, content: 'hello' },
  });

  const content = await tools.execute({
    toolName: 'file_read',
    input: { filePath },
  });

  assert.equal(content, 'hello');

  const evidence = tools.evidence.list();
  assert.equal(evidence.length >= 2, true);
  assert.equal(evidence.every((entry) => entry.success), true);

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter enforces write policy', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-'));
  const outsidePath = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
  const tools = createLocalToolSet([workspace]);

  await assert.rejects(
    async () =>
      tools.execute({
        toolName: 'file_write',
        input: { filePath: outsidePath, content: 'forbidden' },
      }),
    (error: unknown) => error instanceof SafetyViolationError,
  );

  const evidence = tools.evidence.list();
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.success, false);

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter supports shell, testing, diff and search adapters', async () => {
  const tools = createLocalToolSet([process.cwd()]);

  const shellResult = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'node', args: ['--version'], timeoutMs: 5_000 },
  });

  assert.equal(typeof (shellResult as { ok: boolean }).ok, 'boolean');

  const testingResult = await tools.execute({
    toolName: 'testing_run',
    input: { command: 'node', args: ['-e', 'console.log("ok")'] },
  });
  assert.equal((testingResult as { ok: boolean }).ok, true);

  const diffResult = await tools.execute({
    toolName: 'diff_workspace',
    input: {},
  });
  assert.equal(typeof diffResult, 'string');

  const searchResult = await tools.execute({
    toolName: 'search_repo',
    input: { pattern: 'createLocalToolSet', cwd: path.join(process.cwd(), 'packages/tools/src') },
  });
  assert.equal(Array.isArray(searchResult), true);

  const resultFile = path.join(process.cwd(), 'package.json');
  const hasFile = await tools.fileSystem.exists(resultFile);
  assert.equal(hasFile, true);
  const packageJson = await readFile(resultFile, 'utf8');
  assert.equal(packageJson.includes('ai-orchestrator'), true);
});

test('tools adapter blocks non-allowlisted shell command', async () => {
  const tools = createLocalToolSet({
    allowedWritePaths: [process.cwd()],
    allowedShellCommands: ['node'],
  });

  await assert.rejects(
    async () =>
      tools.execute({
        toolName: 'shell_exec',
        input: { command: 'git', args: ['status'] },
      }),
    (error: unknown) =>
      error instanceof SafetyViolationError &&
      error.message.includes('not allowlisted'),
  );
});
