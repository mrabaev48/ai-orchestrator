import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalToolSet, type ToolExecutionOptions } from '@ai-orchestrator/tools';

function toolOptions(workspaceRoot: string): ToolExecutionOptions {
  return {
    executionContext: {
      workspaceRoot,
      policy: 'test_policy',
      permissionScope: 'test_execution',
    },
  };
}

test('tools adapter executes legacy file operations via unified contract', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-'));
  const tools = createLocalToolSet([workspace]);
  const filePath = path.join(workspace, 'notes.txt');

  await tools.execute({
    toolName: 'file_write',
    input: { filePath, content: 'hello' },
  }, toolOptions(workspace));

  const content = await tools.execute({
    toolName: 'file_read',
    input: { filePath },
  }, toolOptions(workspace));

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
  }, toolOptions(workspace));
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
  }, toolOptions(process.cwd()));

  assert.equal(shellResult.ok, true);
  const shellEvidence = tools.evidence.list().find((entry) => entry.toolName === 'shell_exec');
  assert.equal(shellEvidence?.workspaceRoot, process.cwd());
  assert.equal(shellEvidence?.command, 'node');

  const testingResult = await tools.execute({
    toolName: 'testing_run',
    input: { command: 'node', args: ['-e', 'console.log("ok")'] },
  }, toolOptions(process.cwd()));
  assert.equal(testingResult.ok, true);

  const diffResult = await tools.execute({
    toolName: 'diff_workspace',
    input: {},
  }, toolOptions(process.cwd()));
  assert.equal(diffResult.ok, true);

  const searchResult = await tools.execute({
    toolName: 'search_repo',
    input: { pattern: 'createLocalToolSet', cwd: path.join(process.cwd(), 'packages/tools/src') },
  }, toolOptions(process.cwd()));
  assert.equal(searchResult.ok, true);

  const resultFile = path.join(process.cwd(), 'package.json');
  const hasFile = await tools.fileSystem.exists(resultFile);
  assert.equal(hasFile, true);
  const packageJson = await readFile(resultFile, 'utf8');
  assert.equal(packageJson.includes('ai-orchestrator'), true);
});

test('tools adapter requires explicit workspace context for unified execution', async () => {
  const tools = createLocalToolSet([process.cwd()]);
  const executeWithoutOptions = tools.execute as (
    request: Parameters<typeof tools.execute>[0],
  ) => ReturnType<typeof tools.execute>;

  await assert.rejects(
    () => executeWithoutOptions({
      toolName: 'shell_exec',
      input: { command: 'node', args: ['--version'] },
    }),
    /Tool execution requires an explicit workspaceRoot/,
  );
});

test('shell_exec runs in the explicit workspace instead of process cwd', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-cwd-'));
  const tools = createLocalToolSet({
    allowedWritePaths: [workspace],
    allowedShellCommands: ['node'],
  });

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'node', args: ['-e', 'console.log(process.cwd())'] },
  }, toolOptions(workspace));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal((result.output as { stdout: string }).stdout.trim(), await realpath(workspace));
  }

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter blocks workspace escape attempts', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'toolset-escape-'));
  const tools = createLocalToolSet({
    allowedWritePaths: [workspace],
    allowedShellCommands: ['rg'],
  });

  const result = await tools.execute({
    toolName: 'search_repo',
    input: { pattern: 'anything', cwd: os.tmpdir() },
  }, toolOptions(workspace));

  assert.equal(result.ok, false);
  assert.equal(result.error.message.includes('Workspace outside allowed scope is forbidden'), true);

  await rm(workspace, { recursive: true, force: true });
});

test('tools adapter validates high-risk command arguments', async () => {
  const tools = createLocalToolSet({
    allowedWritePaths: [process.cwd()],
    allowedShellCommands: ['git'],
  });

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'git', args: ['checkout', 'main'] },
  }, toolOptions(process.cwd()));

  assert.equal(result.ok, false);
  assert.equal(result.error.message.includes('arguments are not allowed for git'), true);
});

test('tools adapter blocks non-allowlisted shell command', async () => {
  const tools = createLocalToolSet({
    allowedWritePaths: [process.cwd()],
    allowedShellCommands: ['node'],
  });

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'git', args: ['status'] },
  }, toolOptions(process.cwd()));
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
    }, toolOptions(workspace));
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
  }, toolOptions(workspace));
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
  }, toolOptions(workspace));
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
  }, toolOptions(workspace));

  const overLimitWrite = await tools.execute({
    toolName: 'file_write',
    input: { filePath: path.join(workspace, 'two.txt'), content: '2' },
  }, toolOptions(workspace));
  assert.equal(overLimitWrite.ok, false);
  assert.equal(overLimitWrite.error.message.includes('Maximum modified files threshold exceeded'), true);

  await rm(workspace, { recursive: true, force: true });
});


test('tools adapter enforces timeout at runtime boundary', async () => {
  const tools = createLocalToolSet([process.cwd()]);

  const result = await tools.execute({
    toolName: 'shell_exec',
    input: { command: 'node', args: ['-e', 'setTimeout(() => console.log("late"), 200)'], timeoutMs: 10 },
  }, toolOptions(process.cwd()));

  assert.equal(result.ok, false);
  assert.equal(result.error.category, 'timeout');
  assert.equal(result.error.code, 'TOOL_TIMEOUT');
});


test('tools adapter validates shell_exec input schema', async () => {
  const tools = createLocalToolSet([process.cwd()]);
  await assert.rejects(
    async () => tools.execute({
      toolName: 'shell_exec',
      input: { command: 'node', args: ['--version', 123] },
    }, toolOptions(process.cwd())),
    /TOOL_INPUT_SCHEMA_INVALID|Invalid input for shell_exec/,
  );
});

test('tools adapter validates output schema for testing_run', async () => {
  const tools = createLocalToolSet([process.cwd()]);
  const result = await tools.execute({
    toolName: 'testing_run',
    input: { command: 'node', args: ['-e', 'process.exit(2)'] },
  }, toolOptions(process.cwd()));

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(typeof (result.output as { exitCode: number }).exitCode, 'number');
  }
});
