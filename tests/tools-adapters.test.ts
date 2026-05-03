import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

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

  assert.equal(content.ok, true);
  assert.equal(content.determinism.deterministic, true);
  assert.equal((content.ok ? content.output : ''), 'hello');

  const evidence = tools.evidence.list();
  assert.equal(evidence.length >= 2, true);
  assert.equal(evidence.every((entry) => entry.success), true);

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter enforces write policy', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-'));
  const outsidePath = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
  const tools = createLocalToolSet([workspace]);

  const writeOutside = await tools.execute({
    toolName: 'file_write',
    input: { filePath: outsidePath, content: 'forbidden' },
  });
  assert.equal(writeOutside.ok, false);
  assert.equal(writeOutside.error.message.length > 0, true);

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

  assert.equal(shellResult.ok, true);

  const testingResult = await tools.execute({
    toolName: 'testing_run',
    input: { command: 'node', args: ['-e', 'console.log("ok")'] },
  });
  assert.equal(testingResult.ok, true);

  const diffResult = await tools.execute({
    toolName: 'diff_workspace',
    input: {},
  });
  assert.equal(diffResult.ok, true);

  const searchResult = await tools.execute({
    toolName: 'search_repo',
    input: { pattern: 'createLocalToolSet', cwd: path.join(process.cwd(), 'packages/tools/src') },
  });
  assert.equal(searchResult.ok, true);

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

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'git', args: ['status'] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.message.includes('not allowlisted'), true);
});

test('tools adapter blocks writes in read-only and propose-only modes', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-write-mode-'));
  const modes: ('read-only' | 'propose-only')[] = ['read-only', 'propose-only'];

  for (const mode of modes) {
    const tools = createLocalToolSet({
      allowedWritePaths: [workspace],
      allowedShellCommands: ['node'],
      writeMode: mode,
    });

    const result = await tools.execute({
      toolName: 'file_write',
      input: { filePath: path.join(workspace, `${mode}.txt`), content: 'blocked' },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.message.includes(`Write is forbidden in ${mode} mode`), true);
  }

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter requires protected-write mode for protected paths', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-protected-path-'));
  const protectedPath = path.join(workspace, 'package.json');

  const workspaceTools = createLocalToolSet({
    allowedWritePaths: [workspace],
    allowedShellCommands: ['node'],
    writeMode: 'workspace-write',
    protectedWritePaths: [protectedPath],
  });

  const protectedWriteBlocked = await workspaceTools.execute({
    toolName: 'file_write',
    input: { filePath: protectedPath, content: '{}' },
  });
  assert.equal(protectedWriteBlocked.ok, false);
  assert.equal(protectedWriteBlocked.error.message.includes('requires protected-write mode'), true);

  const protectedTools = createLocalToolSet({
    allowedWritePaths: [workspace],
    allowedShellCommands: ['node'],
    writeMode: 'protected-write',
    protectedWritePaths: [protectedPath],
  });

  const protectedWriteAllowed = await protectedTools.execute({
    toolName: 'file_write',
    input: { filePath: protectedPath, content: '{"name":"ok"}' },
  });
  assert.equal(protectedWriteAllowed.ok, true);
  const saved = await readFile(protectedPath, 'utf8');
  assert.equal(saved, '{"name":"ok"}');

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter enforces maximum modified files threshold', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-mod-limit-'));
  const tools = createLocalToolSet({
    allowedWritePaths: [workspace],
    allowedShellCommands: ['node'],
    writeMode: 'workspace-write',
    maxModifiedFiles: 1,
  });

  await tools.execute({
    toolName: 'file_write',
    input: { filePath: path.join(workspace, 'one.txt'), content: '1' },
  });

  const overLimitWrite = await tools.execute({
    toolName: 'file_write',
    input: { filePath: path.join(workspace, 'two.txt'), content: '2' },
  });
  assert.equal(overLimitWrite.ok, false);
  assert.equal(overLimitWrite.error.message.includes('Maximum modified files threshold exceeded'), true);

  await rm(workspace, { recursive: true, force: true });
});


test('tools adapter enforces timeout at runtime boundary', async () => {
  const tools = createLocalToolSet([process.cwd()]);

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'node', args: ['-e', 'setTimeout(() => console.log("late"), 200)'], timeoutMs: 10 },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'timeout');
  assert.equal(result.error.code, 'TOOL_TIMEOUT');
});
