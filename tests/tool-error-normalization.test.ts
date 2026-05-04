import assert from 'node:assert/strict';
import test from 'node:test';

import { ToolExecutionContractError } from '../packages/tools/src/contracts.ts';
import { normalizeToolError } from '../packages/tools/src/errors/tool-error-envelope.ts';

test('normalizeToolError: preserves envelope for typed tool contract error', () => {
  const typed = new ToolExecutionContractError({
    category: 'timeout',
    retriable: true,
    code: 'TOOL_TIMEOUT',
    message: 'timed out',
    details: { timeoutMs: 10 },
  });

  const envelope = normalizeToolError(typed, 'TOOL_EXECUTION_FAILED');
  assert.equal(envelope.code, 'TOOL_TIMEOUT');
  assert.equal(envelope.category, 'timeout');
  assert.equal(envelope.retriable, true);
});

test('normalizeToolError: maps AbortError to TOOL_CANCELLED envelope', () => {
  const abortError = new DOMException('abort requested', 'AbortError');

  const envelope = normalizeToolError(abortError, 'TOOL_EXECUTION_FAILED');
  assert.equal(envelope.code, 'TOOL_CANCELLED');
  assert.equal(envelope.category, 'cancelled');
  assert.equal(envelope.retriable, false);
  assert.equal(envelope.message, 'abort requested');
});

test('normalizeToolError: uses fallback for unknown execution errors', () => {
  const envelope = normalizeToolError(new Error('boom'), 'TOOL_EXECUTION_FAILED');
  assert.equal(envelope.code, 'TOOL_EXECUTION_FAILED');
  assert.equal(envelope.category, 'execution');
  assert.equal(envelope.retriable, true);
  assert.equal(envelope.message, 'boom');
});
