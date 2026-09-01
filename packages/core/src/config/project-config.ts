import { z } from 'zod';

import { ConfigError } from '@ai-orchestrator/shared';

const identifierSchema = z
  .string()
  .min(1, 'must be a non-empty string')
  .refine((value) => !value.includes(':'), { message: "must not include ':'" });

// Enums

export const safeWriteModeSchema = z.enum([
  'read-only',
  'propose-only',
  'sandbox-write',
  'workspace-write',
  'protected-write',
]);
export type SafeWriteMode = z.infer<typeof safeWriteModeSchema>;

export const approvalRequestedActionSchema = z.enum([
  'git_push',
  'pr_draft',
  'db_migration',
  'file_delete',
  'api_breaking_change',
  'dependency_bump',
  'security_auth_change',
  'production_config_change',
  'bulk_file_change',
]);
export type ApprovalRequestedAction = z.infer<typeof approvalRequestedActionSchema>;

export const approvalGateModeSchema = z.enum(['disabled', 'enabled']);
export type ApprovalGateMode = z.infer<typeof approvalGateModeSchema>;

// Workflow

export const workflowConfigSchema = z.strictObject({
  maxStepsPerRun: z.number().int().positive(),
  maxRetriesPerTask: z.number().int().nonnegative(),
  approvalGateMode: approvalGateModeSchema,
  approvalRequiredActions: z.array(approvalRequestedActionSchema),
  approvalBulkFileThreshold: z.number().int().positive(),
});
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

const workflowConfigOverrideSchema = workflowConfigSchema.partial();
export type WorkflowConfigOverride = z.infer<typeof workflowConfigOverrideSchema>;

// Tools

export const toolsConfigSchema = z.strictObject({
  writeMode: safeWriteModeSchema,
  allowedWritePaths: z.array(z.string().trim().min(1)),
  protectedWritePaths: z.array(z.string().trim().min(1)),
  allowedShellCommands: z.array(z.string().trim().min(1)),
  maxModifiedFiles: z.number().int().positive(),
});
export type ToolsConfig = z.infer<typeof toolsConfigSchema>;

const toolsConfigOverrideSchema = toolsConfigSchema.partial();
export type ToolsConfigOverride = z.infer<typeof toolsConfigOverrideSchema>;

// Budgets

const tokenBudgetSchema = z.strictObject({
  perRun: z.number().int().positive().optional(),
  perTask: z.number().int().positive().optional(),
  perDay: z.number().int().positive().optional(),
});
export type TokenBudget = z.infer<typeof tokenBudgetSchema>;

const moneyBudgetSchema = z.strictObject({
  perRunUsdMicro: z.number().int().nonnegative().optional(),
  perTaskUsdMicro: z.number().int().nonnegative().optional(),
  perDayUsdMicro: z.number().int().nonnegative().optional(),
});
export type MoneyBudget = z.infer<typeof moneyBudgetSchema>;

export const budgetsConfigSchema = z.strictObject({
  tokens: tokenBudgetSchema,
  money: moneyBudgetSchema,
});
export type BudgetsConfig = z.infer<typeof budgetsConfigSchema>;

const budgetsConfigOverrideSchema = z.strictObject({
  tokens: tokenBudgetSchema.optional(),
  money: moneyBudgetSchema.optional(),
});
export type BudgetsConfigOverride = z.infer<typeof budgetsConfigOverrideSchema>;

// ProjectConfigOverride — shared shape for the instance/agent/run layers, and for the entries
// stored in ProjectConfig.agents. Every field narrows a section of ProjectConfig; a layer that
// omits a section leaves it untouched by that layer.

export const projectConfigOverrideSchema = z.strictObject({
  workflow: workflowConfigOverrideSchema.optional(),
  tools: toolsConfigOverrideSchema.optional(),
  budgets: budgetsConfigOverrideSchema.optional(),
  modelRoutingRef: z.string().min(1).optional(),
});
export type ProjectConfigOverride = z.infer<typeof projectConfigOverrideSchema>;

// ProjectConfig — the full, authoritative per-project policy document.

export const projectConfigSchema = z.strictObject({
  projectId: identifierSchema,
  version: z.number().int().nonnegative(),
  workflow: workflowConfigSchema,
  tools: toolsConfigSchema,
  budgets: budgetsConfigSchema,
  modelRoutingRef: z.string().min(1).optional(),
  agents: z.record(z.string().min(1), projectConfigOverrideSchema).optional(),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export function assertProjectConfig(value: ProjectConfig): void {
  const result = projectConfigSchema.safeParse(value);
  if (!result.success) {
    throw new ConfigError('ProjectConfig failed validation', {
      details: result.error.issues,
    });
  }
}

// Effective config resolution
//
// Layers apply in order — defaults ← instance ← project ← agent ← run — with each later layer
// overriding the previous one field by field. Object sections (workflow/tools, and budgets'
// nested tokens/money) are merged one level deep, so a layer can narrow a single field without
// clearing its siblings from a lower layer. Arrays (e.g. tools.allowedWritePaths) are replaced
// wholesale by the most specific layer that defines them — never concatenated or deduped — so
// the effective array at any point is always exactly one layer's value.
//
// Note: workflow/tools are fully required on ProjectConfig, so once the project layer applies
// it always fully determines those sections regardless of what instance set — instance only has
// an observable effect on genuinely optional leaves (budgets.tokens/*, budgets.money/*,
// modelRoutingRef) that the project document leaves unset.

const DEFAULT_PROJECT_CONFIG_OVERRIDE: ProjectConfigOverride = {
  workflow: {
    maxStepsPerRun: 8,
    maxRetriesPerTask: 3,
    approvalGateMode: 'disabled',
    approvalRequiredActions: [],
    approvalBulkFileThreshold: 25,
  },
  tools: {
    writeMode: 'workspace-write',
    allowedWritePaths: ['.'],
    protectedWritePaths: [],
    allowedShellCommands: [],
    maxModifiedFiles: 200,
  },
  budgets: {
    tokens: {},
    money: {},
  },
};

function mergeBudgetsOverride(
  base: BudgetsConfigOverride | undefined,
  override: BudgetsConfigOverride | undefined,
): BudgetsConfigOverride | undefined {
  if (!override) {
    return base;
  }

  return {
    tokens: override.tokens ? { ...base?.tokens, ...override.tokens } : base?.tokens,
    money: override.money ? { ...base?.money, ...override.money } : base?.money,
  };
}

function mergeConfigOverride(
  base: ProjectConfigOverride,
  override: ProjectConfigOverride | undefined,
): ProjectConfigOverride {
  if (!override) {
    return base;
  }

  return {
    workflow: override.workflow ? { ...base.workflow, ...override.workflow } : base.workflow,
    tools: override.tools ? { ...base.tools, ...override.tools } : base.tools,
    budgets: mergeBudgetsOverride(base.budgets, override.budgets),
    modelRoutingRef: override.modelRoutingRef ?? base.modelRoutingRef,
  };
}

function projectAsOverride(project: ProjectConfig): ProjectConfigOverride {
  return {
    workflow: project.workflow,
    tools: project.tools,
    budgets: project.budgets,
    modelRoutingRef: project.modelRoutingRef,
  };
}

/**
 * Resolves the effective ProjectConfig by merging defaults ← instance ← project ← agent ← run,
 * later layers overriding earlier ones field by field. Pure and deterministic — never reads
 * env or performs IO. Throws ConfigError if the merged result fails ProjectConfig validation.
 */
export function resolveEffectiveConfig(
  instance: ProjectConfigOverride | undefined,
  project: ProjectConfig,
  agent?: ProjectConfigOverride,
  run?: ProjectConfigOverride,
): ProjectConfig {
  const withInstance = mergeConfigOverride(DEFAULT_PROJECT_CONFIG_OVERRIDE, instance);
  const withProject = mergeConfigOverride(withInstance, projectAsOverride(project));
  const withAgent = mergeConfigOverride(withProject, agent);
  const effective = mergeConfigOverride(withAgent, run);

  const candidate: ProjectConfig = {
    projectId: project.projectId,
    version: project.version,
    agents: project.agents,
    workflow: effective.workflow as WorkflowConfig,
    tools: effective.tools as ToolsConfig,
    budgets: effective.budgets as BudgetsConfig,
    modelRoutingRef: effective.modelRoutingRef,
  };

  const result = projectConfigSchema.safeParse(candidate);
  if (!result.success) {
    throw new ConfigError('Failed to resolve effective project config', {
      details: result.error.issues,
    });
  }

  return result.data;
}
