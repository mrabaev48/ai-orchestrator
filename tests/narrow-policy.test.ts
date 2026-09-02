import assert from 'node:assert/strict';
import test from 'node:test';

import {
  narrowBudgets,
  narrowToolPolicy,
  narrowWorkflowPolicy,
  type BudgetsConfig,
  type ToolsConfig,
  type WorkflowConfig,
} from '@ai-orchestrator/core';
import { PolicyEscalationError } from '@ai-orchestrator/shared';

function makeTools(overrides: Partial<ToolsConfig> = {}): ToolsConfig {
  return {
    writeMode: 'workspace-write',
    allowedWritePaths: ['./src', './packages'],
    protectedWritePaths: ['./secrets'],
    allowedShellCommands: ['git', 'pnpm'],
    maxModifiedFiles: 100,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    maxStepsPerRun: 10,
    maxRetriesPerTask: 3,
    approvalGateMode: 'enabled',
    approvalRequiredActions: ['git_push', 'file_delete'],
    approvalBulkFileThreshold: 25,
    ...overrides,
  };
}

function makeBudgets(overrides: Partial<BudgetsConfig> = {}): BudgetsConfig {
  return {
    tokens: { perRun: 100_000, perTask: 10_000, perDay: 1_000_000 },
    money: { perRunUsdMicro: 500_000, perTaskUsdMicro: 50_000, perDayUsdMicro: 5_000_000 },
    ...overrides,
  };
}

function assertEscalation(fn: () => void, field: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof PolicyEscalationError, 'expected a PolicyEscalationError');
    const details = error.details as { field: string };
    assert.equal(details.field, field);
    return true;
  });
}

// narrowToolPolicy — writeMode

test('narrowToolPolicy: writeMode narrows one step down', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(makeTools({ writeMode: 'workspace-write' }), makeTools({ writeMode: 'sandbox-write' }));
  });
});

test('narrowToolPolicy: writeMode equal passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(makeTools({ writeMode: 'workspace-write' }), makeTools({ writeMode: 'workspace-write' }));
  });
});

test('narrowToolPolicy: writeMode widens one step up throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ writeMode: 'workspace-write' }),
        makeTools({ writeMode: 'protected-write' }),
      ); },
    'writeMode',
  );
});

test('narrowToolPolicy: writeMode widens across the full range throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(makeTools({ writeMode: 'read-only' }), makeTools({ writeMode: 'protected-write' })); },
    'writeMode',
  );
});

// narrowToolPolicy — allowedWritePaths

test('narrowToolPolicy: allowedWritePaths proper subset passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ allowedWritePaths: ['./src', './packages'] }),
      makeTools({ allowedWritePaths: ['./src'] }),
    );
  });
});

test('narrowToolPolicy: allowedWritePaths equal set, different order passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ allowedWritePaths: ['./src', './packages'] }),
      makeTools({ allowedWritePaths: ['./packages', './src'] }),
    );
  });
});

test('narrowToolPolicy: allowedWritePaths equal set with duplicate in child passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ allowedWritePaths: ['./src'] }),
      makeTools({ allowedWritePaths: ['./src', './src'] }),
    );
  });
});

test('narrowToolPolicy: allowedWritePaths adds an entry not in parent throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ allowedWritePaths: ['./src'] }),
        makeTools({ allowedWritePaths: ['./src', './packages'] }),
      ); },
    'allowedWritePaths',
  );
});

test('narrowToolPolicy: allowedWritePaths empty parent, non-empty child throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(makeTools({ allowedWritePaths: [] }), makeTools({ allowedWritePaths: ['./src'] })); },
    'allowedWritePaths',
  );
});

// narrowToolPolicy — allowedShellCommands

test('narrowToolPolicy: allowedShellCommands narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ allowedShellCommands: ['git', 'pnpm'] }),
      makeTools({ allowedShellCommands: ['git'] }),
    );
  });
});

test('narrowToolPolicy: allowedShellCommands equal passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ allowedShellCommands: ['git'] }),
      makeTools({ allowedShellCommands: ['git'] }),
    );
  });
});

test('narrowToolPolicy: allowedShellCommands adds a command throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ allowedShellCommands: ['git'] }),
        makeTools({ allowedShellCommands: ['git', 'curl'] }),
      ); },
    'allowedShellCommands',
  );
});

// narrowToolPolicy — protectedWritePaths

test('narrowToolPolicy: protectedWritePaths child superset passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ protectedWritePaths: ['./secrets'] }),
      makeTools({ protectedWritePaths: ['./secrets', './keys'] }),
    );
  });
});

test('narrowToolPolicy: protectedWritePaths equal passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ protectedWritePaths: ['./secrets'] }),
      makeTools({ protectedWritePaths: ['./secrets'] }),
    );
  });
});

test('narrowToolPolicy: protectedWritePaths equal set, reordered with duplicate passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(
      makeTools({ protectedWritePaths: ['./secrets', './keys'] }),
      makeTools({ protectedWritePaths: ['./keys', './secrets', './keys'] }),
    );
  });
});

test('narrowToolPolicy: protectedWritePaths drops a protected path throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ protectedWritePaths: ['./secrets', './keys'] }),
        makeTools({ protectedWritePaths: ['./secrets'] }),
      ); },
    'protectedWritePaths',
  );
});

test('narrowToolPolicy: protectedWritePaths empties a non-empty parent throws', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ protectedWritePaths: ['./secrets'] }),
        makeTools({ protectedWritePaths: [] }),
      ); },
    'protectedWritePaths',
  );
});

// narrowToolPolicy — maxModifiedFiles

test('narrowToolPolicy: maxModifiedFiles narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(makeTools({ maxModifiedFiles: 100 }), makeTools({ maxModifiedFiles: 50 }));
  });
});

test('narrowToolPolicy: maxModifiedFiles equal passes', () => {
  assert.doesNotThrow(() => {
    narrowToolPolicy(makeTools({ maxModifiedFiles: 100 }), makeTools({ maxModifiedFiles: 100 }));
  });
});

test('narrowToolPolicy: maxModifiedFiles widens throws', () => {
  assertEscalation(
    () => { narrowToolPolicy(makeTools({ maxModifiedFiles: 100 }), makeTools({ maxModifiedFiles: 150 })); },
    'maxModifiedFiles',
  );
});

// narrowToolPolicy — whole-object and ordering

test('narrowToolPolicy: fully equal ToolsConfig does not throw', () => {
  const tools = makeTools();
  assert.doesNotThrow(() => {
    narrowToolPolicy(tools, makeTools());
  });
});

test('narrowToolPolicy: widening two fields at once reports the first field in declaration order', () => {
  assertEscalation(
    () =>
      { narrowToolPolicy(
        makeTools({ writeMode: 'workspace-write', maxModifiedFiles: 100 }),
        makeTools({ writeMode: 'protected-write', maxModifiedFiles: 150 }),
      ); },
    'writeMode',
  );
});

// narrowWorkflowPolicy — approvalGateMode

test('narrowWorkflowPolicy: approvalGateMode relaxing enabled to disabled throws', () => {
  assertEscalation(
    () =>
      { narrowWorkflowPolicy(
        makeWorkflow({ approvalGateMode: 'enabled' }),
        makeWorkflow({ approvalGateMode: 'disabled' }),
      ); },
    'approvalGateMode',
  );
});

test('narrowWorkflowPolicy: approvalGateMode tightening disabled to enabled passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalGateMode: 'disabled' }),
      makeWorkflow({ approvalGateMode: 'enabled' }),
    );
  });
});

test('narrowWorkflowPolicy: approvalGateMode both enabled passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalGateMode: 'enabled' }),
      makeWorkflow({ approvalGateMode: 'enabled' }),
    );
  });
});

test('narrowWorkflowPolicy: approvalGateMode both disabled passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalGateMode: 'disabled' }),
      makeWorkflow({ approvalGateMode: 'disabled' }),
    );
  });
});

// narrowWorkflowPolicy — approvalRequiredActions

test('narrowWorkflowPolicy: approvalRequiredActions child superset passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalRequiredActions: ['git_push'] }),
      makeWorkflow({ approvalRequiredActions: ['git_push', 'file_delete'] }),
    );
  });
});

test('narrowWorkflowPolicy: approvalRequiredActions equal set, reordered with duplicate passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalRequiredActions: ['git_push', 'file_delete'] }),
      makeWorkflow({ approvalRequiredActions: ['file_delete', 'git_push', 'file_delete'] }),
    );
  });
});

test('narrowWorkflowPolicy: approvalRequiredActions drops a required action throws', () => {
  assertEscalation(
    () =>
      { narrowWorkflowPolicy(
        makeWorkflow({ approvalRequiredActions: ['git_push', 'file_delete'] }),
        makeWorkflow({ approvalRequiredActions: ['git_push'] }),
      ); },
    'approvalRequiredActions',
  );
});

test('narrowWorkflowPolicy: approvalRequiredActions empties a non-empty parent throws', () => {
  assertEscalation(
    () =>
      { narrowWorkflowPolicy(
        makeWorkflow({ approvalRequiredActions: ['git_push'] }),
        makeWorkflow({ approvalRequiredActions: [] }),
      ); },
    'approvalRequiredActions',
  );
});

// narrowWorkflowPolicy — numeric limits

test('narrowWorkflowPolicy: maxStepsPerRun narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(makeWorkflow({ maxStepsPerRun: 10 }), makeWorkflow({ maxStepsPerRun: 5 }));
  });
});

test('narrowWorkflowPolicy: maxStepsPerRun equal passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(makeWorkflow({ maxStepsPerRun: 10 }), makeWorkflow({ maxStepsPerRun: 10 }));
  });
});

test('narrowWorkflowPolicy: maxStepsPerRun widens throws', () => {
  assertEscalation(
    () => { narrowWorkflowPolicy(makeWorkflow({ maxStepsPerRun: 10 }), makeWorkflow({ maxStepsPerRun: 20 })); },
    'maxStepsPerRun',
  );
});

test('narrowWorkflowPolicy: maxRetriesPerTask narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(makeWorkflow({ maxRetriesPerTask: 3 }), makeWorkflow({ maxRetriesPerTask: 1 }));
  });
});

test('narrowWorkflowPolicy: maxRetriesPerTask equal passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(makeWorkflow({ maxRetriesPerTask: 3 }), makeWorkflow({ maxRetriesPerTask: 3 }));
  });
});

test('narrowWorkflowPolicy: maxRetriesPerTask widens throws', () => {
  assertEscalation(
    () =>
      { narrowWorkflowPolicy(makeWorkflow({ maxRetriesPerTask: 3 }), makeWorkflow({ maxRetriesPerTask: 5 })); },
    'maxRetriesPerTask',
  );
});

test('narrowWorkflowPolicy: approvalBulkFileThreshold narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalBulkFileThreshold: 25 }),
      makeWorkflow({ approvalBulkFileThreshold: 10 }),
    );
  });
});

test('narrowWorkflowPolicy: approvalBulkFileThreshold equal passes', () => {
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(
      makeWorkflow({ approvalBulkFileThreshold: 25 }),
      makeWorkflow({ approvalBulkFileThreshold: 25 }),
    );
  });
});

test('narrowWorkflowPolicy: approvalBulkFileThreshold widens throws', () => {
  assertEscalation(
    () =>
      { narrowWorkflowPolicy(
        makeWorkflow({ approvalBulkFileThreshold: 25 }),
        makeWorkflow({ approvalBulkFileThreshold: 50 }),
      ); },
    'approvalBulkFileThreshold',
  );
});

test('narrowWorkflowPolicy: fully equal WorkflowConfig does not throw', () => {
  const workflow = makeWorkflow();
  assert.doesNotThrow(() => {
    narrowWorkflowPolicy(workflow, makeWorkflow());
  });
});

// narrowBudgets — tokens.perRun (representative of every optional numeric leaf)

test('narrowBudgets: tokens.perRun both defined, narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowBudgets(
      makeBudgets({ tokens: { perRun: 100_000 } }),
      makeBudgets({ tokens: { perRun: 50_000 } }),
    );
  });
});

test('narrowBudgets: tokens.perRun equal passes', () => {
  assert.doesNotThrow(() => {
    narrowBudgets(
      makeBudgets({ tokens: { perRun: 100_000 } }),
      makeBudgets({ tokens: { perRun: 100_000 } }),
    );
  });
});

test('narrowBudgets: tokens.perRun widens throws', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ tokens: { perRun: 100_000 } }),
        makeBudgets({ tokens: { perRun: 200_000 } }),
      ); },
    'budgets.tokens.perRun',
  );
});

test('narrowBudgets: tokens.perRun removing an existing limit throws', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ tokens: { perRun: 100_000 } }),
        makeBudgets({ tokens: { perRun: undefined } }),
      ); },
    'budgets.tokens.perRun',
  );
});

test('narrowBudgets: tokens.perRun adding a limit where parent had none passes', () => {
  assert.doesNotThrow(() => {
    narrowBudgets(
      makeBudgets({ tokens: { perRun: undefined } }),
      makeBudgets({ tokens: { perRun: 50_000 } }),
    );
  });
});

test('narrowBudgets: tokens.perRun both undefined passes', () => {
  assert.doesNotThrow(() => {
    narrowBudgets(
      makeBudgets({ tokens: { perRun: undefined } }),
      makeBudgets({ tokens: { perRun: undefined } }),
    );
  });
});

// narrowBudgets — money.perRunUsdMicro (confirms the money section is checked too)

test('narrowBudgets: money.perRunUsdMicro narrows passes', () => {
  assert.doesNotThrow(() => {
    narrowBudgets(
      makeBudgets({ money: { perRunUsdMicro: 500_000 } }),
      makeBudgets({ money: { perRunUsdMicro: 100_000 } }),
    );
  });
});

test('narrowBudgets: money.perRunUsdMicro widens throws', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ money: { perRunUsdMicro: 500_000 } }),
        makeBudgets({ money: { perRunUsdMicro: 1_000_000 } }),
      ); },
    'budgets.money.perRunUsdMicro',
  );
});

test('narrowBudgets: money.perRunUsdMicro removing an existing limit throws', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ money: { perRunUsdMicro: 500_000 } }),
        makeBudgets({ money: { perRunUsdMicro: undefined } }),
      ); },
    'budgets.money.perRunUsdMicro',
  );
});

test('narrowBudgets: fully equal BudgetsConfig does not throw', () => {
  const budgets = makeBudgets();
  assert.doesNotThrow(() => {
    narrowBudgets(budgets, makeBudgets());
  });
});

test('narrowBudgets: fully equal BudgetsConfig with every leaf undefined does not throw', () => {
  const budgets: BudgetsConfig = { tokens: {}, money: {} };
  assert.doesNotThrow(() => {
    narrowBudgets(budgets, { tokens: {}, money: {} });
  });
});

test('narrowBudgets: widening two token fields at once reports perRun first, before perTask/perDay', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ tokens: { perRun: 100_000, perTask: 10_000 } }),
        makeBudgets({ tokens: { perRun: 200_000, perTask: 20_000 } }),
      ); },
    'budgets.tokens.perRun',
  );
});

test('narrowBudgets: widening a money field only reports it after all token fields pass', () => {
  assertEscalation(
    () =>
      { narrowBudgets(
        makeBudgets({ money: { perTaskUsdMicro: 50_000 } }),
        makeBudgets({ money: { perTaskUsdMicro: 60_000 } }),
      ); },
    'budgets.money.perTaskUsdMicro',
  );
});
