import assert from 'node:assert/strict';
import test from 'node:test';
import { propagateAbort } from '../packages/execution/src/cancellation/propagate-abort.ts';
import { createAbortAwareSignal } from '../packages/tools/src/runtime/abort-aware-adapter.ts';
import { ToolExecutionContractError } from '../packages/tools/src/contracts.ts';

test('propagateAbort: parent cancellation propagates reason to child signal', () => {
  const parent = new AbortController();
  const child = propagateAbort(parent.signal);

  parent.abort('run_cancelled');

  assert.equal(child.signal.aborted, true);
  assert.equal(child.signal.reason, 'run_cancelled');
  child.dispose();
});

test('propagateAbort: dispose detaches listener and prevents later propagation', () => {
  const parent = new AbortController();
  const child = propagateAbort(parent.signal);

  child.dispose();
  parent.abort('late_cancel');

  assert.equal(child.signal.aborted, false);
});

test('createAbortAwareSignal: throws typed TOOL_CANCELLED on pre-aborted parent', () => {
  const parent = new AbortController();
  parent.abort('cancelled_before_start');

  assert.throws(
    () => createAbortAwareSignal(parent.signal, 'shell_exec'),
    (error: unknown) => {
      assert.equal(error instanceof ToolExecutionContractError, true);
      if (!(error instanceof ToolExecutionContractError)) {
        return false;
      }
      assert.equal(error.envelope.code, 'TOOL_CANCELLED');
      assert.equal(error.envelope.category, 'cancelled');
      return true;
    },
  );
});

test('createAbortAwareSignal: dispose detaches listener and prevents later propagation', () => {
  const parent = new AbortController();
  const child = createAbortAwareSignal(parent.signal, 'shell_exec');

  child.dispose();
  parent.abort('late_tool_cancel');

  assert.equal(child.signal.aborted, false);
});
