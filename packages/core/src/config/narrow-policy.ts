import { PolicyEscalationError } from '@ai-orchestrator/shared';

import type {
  ApprovalGateMode,
  BudgetsConfig,
  MoneyBudget,
  SafeWriteMode,
  TokenBudget,
  ToolsConfig,
  WorkflowConfig,
} from './project-config.js';

// Narrowing invariant (0103): a child policy layer (agent/run) may only ever be equal to or
// more restrictive than its parent (project/instance) — never wider. Operands must be fully
// resolved ToolsConfig/WorkflowConfig/BudgetsConfig values (e.g. obtained via
// resolveEffectiveConfig) — NOT the *Override partial types, whose absent fields are ambiguous
// between "inherit" and "unconstrained". Throws PolicyEscalationError naming the first
// offending field, in a fixed field order. Pure: no IO, no state, no randomness.

const SAFE_WRITE_MODE_RANK: Record<SafeWriteMode, number> = {
  'read-only': 0,
  'propose-only': 1,
  'sandbox-write': 2,
  'workspace-write': 3,
  'protected-write': 4,
};

const APPROVAL_GATE_MODE_RANK: Record<ApprovalGateMode, number> = {
  disabled: 0,
  enabled: 1,
};

function isSubset(child: readonly string[], parent: readonly string[]): boolean {
  const parentSet = new Set(parent);
  return child.every((item) => parentSet.has(item));
}

function assertNoWiden(
  condition: boolean,
  field: string,
  parentValue: unknown,
  childValue: unknown,
  reason: string,
): void {
  if (!condition) {
    throw new PolicyEscalationError(`Policy escalation: field "${field}" widens parent policy`, {
      details: { field, parentValue, childValue, reason },
    });
  }
}

/**
 * Asserts that `child` only narrows (or matches) `parent` on every SafeWriteMode/path/
 * command/maxModifiedFiles dimension of ToolsConfig. Throws PolicyEscalationError, naming the
 * first offending field, on any widening. Pure — no IO, no state access.
 */
export function narrowToolPolicy(parent: ToolsConfig, child: ToolsConfig): void {
  assertNoWiden(
    SAFE_WRITE_MODE_RANK[child.writeMode] <= SAFE_WRITE_MODE_RANK[parent.writeMode],
    'writeMode',
    parent.writeMode,
    child.writeMode,
    'child writeMode must be no more permissive than parent writeMode',
  );

  assertNoWiden(
    isSubset(child.allowedWritePaths, parent.allowedWritePaths),
    'allowedWritePaths',
    parent.allowedWritePaths,
    child.allowedWritePaths,
    'child allowedWritePaths must be a subset of parent allowedWritePaths',
  );

  assertNoWiden(
    isSubset(child.allowedShellCommands, parent.allowedShellCommands),
    'allowedShellCommands',
    parent.allowedShellCommands,
    child.allowedShellCommands,
    'child allowedShellCommands must be a subset of parent allowedShellCommands',
  );

  assertNoWiden(
    isSubset(parent.protectedWritePaths, child.protectedWritePaths),
    'protectedWritePaths',
    parent.protectedWritePaths,
    child.protectedWritePaths,
    'child protectedWritePaths must be a superset of parent protectedWritePaths',
  );

  assertNoWiden(
    child.maxModifiedFiles <= parent.maxModifiedFiles,
    'maxModifiedFiles',
    parent.maxModifiedFiles,
    child.maxModifiedFiles,
    'child maxModifiedFiles must be less than or equal to parent maxModifiedFiles',
  );
}

/**
 * Asserts that `child` only narrows (or matches) `parent` on every dimension of WorkflowConfig:
 * approvalGateMode may not relax from 'enabled' to 'disabled' (that would silently drop every
 * approval gate), approvalRequiredActions must stay a superset, and every numeric limit
 * (maxStepsPerRun, maxRetriesPerTask, approvalBulkFileThreshold) must be <= the parent's.
 * Throws PolicyEscalationError, naming the first offending field. Pure.
 */
export function narrowWorkflowPolicy(parent: WorkflowConfig, child: WorkflowConfig): void {
  assertNoWiden(
    APPROVAL_GATE_MODE_RANK[child.approvalGateMode] >=
      APPROVAL_GATE_MODE_RANK[parent.approvalGateMode],
    'approvalGateMode',
    parent.approvalGateMode,
    child.approvalGateMode,
    'child approvalGateMode must not relax from "enabled" to "disabled"',
  );

  assertNoWiden(
    isSubset(parent.approvalRequiredActions, child.approvalRequiredActions),
    'approvalRequiredActions',
    parent.approvalRequiredActions,
    child.approvalRequiredActions,
    'child approvalRequiredActions must be a superset of parent approvalRequiredActions',
  );

  assertNoWiden(
    child.maxStepsPerRun <= parent.maxStepsPerRun,
    'maxStepsPerRun',
    parent.maxStepsPerRun,
    child.maxStepsPerRun,
    'child maxStepsPerRun must be less than or equal to parent maxStepsPerRun',
  );

  assertNoWiden(
    child.maxRetriesPerTask <= parent.maxRetriesPerTask,
    'maxRetriesPerTask',
    parent.maxRetriesPerTask,
    child.maxRetriesPerTask,
    'child maxRetriesPerTask must be less than or equal to parent maxRetriesPerTask',
  );

  assertNoWiden(
    child.approvalBulkFileThreshold <= parent.approvalBulkFileThreshold,
    'approvalBulkFileThreshold',
    parent.approvalBulkFileThreshold,
    child.approvalBulkFileThreshold,
    'child approvalBulkFileThreshold must be less than or equal to parent approvalBulkFileThreshold',
  );
}

function narrowOptionalNumeric(
  parent: number | undefined,
  child: number | undefined,
  field: string,
): void {
  if (parent === undefined) {
    // Parent left this leaf unconstrained; child may leave it unconstrained too, or add any
    // finite limit — adding a limit only ever narrows.
    return;
  }
  assertNoWiden(
    child !== undefined && child <= parent,
    field,
    parent,
    child,
    `child ${field} must be defined and less than or equal to parent ${field}`,
  );
}

/**
 * Asserts that `child` only narrows (or matches) `parent` on every leaf of BudgetsConfig
 * (tokens.perRun/perTask/perDay, money.perRunUsdMicro/perTaskUsdMicro/perDayUsdMicro). An
 * unset (undefined) leaf means "no limit"; child may only ever add or tighten a limit, never
 * remove or loosen one the parent set. Throws PolicyEscalationError, naming the first offending
 * field. Pure. Not one of the task doc's two headline functions, but "бюджеты" (budgets) is
 * explicitly listed in its numeric-limits scope bullet — BudgetsConfig is a sibling
 * ProjectConfig section, not part of ToolsConfig/WorkflowConfig, so it gets its own
 * correctly-typed function rather than being force-fit into either of the other two.
 */
export function narrowBudgets(parent: BudgetsConfig, child: BudgetsConfig): void {
  const tokenFields: (keyof TokenBudget)[] = ['perRun', 'perTask', 'perDay'];
  for (const field of tokenFields) {
    narrowOptionalNumeric(parent.tokens[field], child.tokens[field], `budgets.tokens.${field}`);
  }

  const moneyFields: (keyof MoneyBudget)[] = [
    'perRunUsdMicro',
    'perTaskUsdMicro',
    'perDayUsdMicro',
  ];
  for (const field of moneyFields) {
    narrowOptionalNumeric(parent.money[field], child.money[field], `budgets.money.${field}`);
  }
}
