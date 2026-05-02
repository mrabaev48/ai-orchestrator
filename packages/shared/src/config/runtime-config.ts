import { accessSync, existsSync, readFileSync, statSync, constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { ConfigError } from '../errors/index.ts';

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const logFormatSchema = z.enum(['json']);
const llmProviderSchema = z.enum(['openai', 'anthropic', 'mock']);
const stateBackendSchema = z.enum(['memory', 'postgresql']);
const runLockProviderSchema = z.enum(['noop', 'postgresql', 'redis', 'etcd']);
const workspaceManagerModeSchema = z.enum(['git-worktree', 'static']);
const qualityGateModeSchema = z.enum(['tooling', 'synthetic']);
const approvalGateModeSchema = z.enum(['disabled', 'enabled']);
const readinessCriterionIdSchema = z.enum([
  'repo-lint',
  'repo-tests',
  'repo-typecheck',
  'execution-blockers',
  'failure-queue',
  'documentation-artifact',
]);
const approvalRequestedActionSchema = z.enum([
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
const safeWriteModeSchema = z.enum([
  'read-only',
  'propose-only',
  'sandbox-write',
  'workspace-write',
  'protected-write',
]);

const runtimeConfigSchema = z.strictObject({
  llm: z.strictObject({
    provider: llmProviderSchema,
    model: z.string().trim().min(1),
    roleModels: z.record(z.string(), z.string().trim().min(1)).optional(),
    fallbackModel: z.string().trim().min(1).optional(),
    tokenBudgetPerRun: z.number().int().positive().optional(),
    tokenBudgetPerTask: z.number().int().positive().optional(),
    maxRunCostUsdMicro: z.number().int().nonnegative().optional(),
    modelCostPer1kTokensUsdMicro: z.record(z.string(), z.number().int().nonnegative()).optional(),
    apiKey: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2),
    timeoutMs: z.number().int().positive(),
  }),
  state: z.strictObject({
    backend: stateBackendSchema,
    postgresDsn: z.string().trim().min(1),
    postgresSchema: z.string().trim().min(1),
    snapshotOnBootstrap: z.boolean(),
    snapshotOnTaskCompletion: z.boolean(),
    snapshotOnMilestoneCompletion: z.boolean(),
  }),
  workflow: z.strictObject({
    maxStepsPerRun: z.number().int().positive(),
    maxRoleStepsPerTask: z.number().int().positive().optional(),
    maxRoleWallTimeMs: z.number().int().positive().optional(),
    maxRetriesPerTask: z.number().int().nonnegative(),
    workerCount: z.number().int().positive().optional(),
    runLockProvider: runLockProviderSchema.optional(),
    runLockDsn: z.string().trim().min(1).optional(),
    workspaceManagerMode: workspaceManagerModeSchema.optional(),
    workspaceBranchTtlHours: z.number().int().positive().optional(),
    qualityGateMode: qualityGateModeSchema.optional(),
    approvalGateMode: approvalGateModeSchema.optional(),
    approvalRequiredActions: z.array(approvalRequestedActionSchema).min(1).optional(),
    approvalBulkFileThreshold: z.number().int().positive().optional(),
    readinessScorecardPolicy: z.strictObject({
      id: z.string().trim().min(1),
      passThresholdPercent: z.number().int().min(0).max(100),
      enabledCriteria: z.array(readinessCriterionIdSchema).min(1),
    }).optional(),
  }),
  tools: z.strictObject({
    allowedWritePaths: z.array(z.string().trim().min(1)).min(1),
    allowedShellCommands: z.array(z.string().trim().min(1)).min(1),
    writeMode: safeWriteModeSchema.optional(),
    protectedWritePaths: z.array(z.string().trim().min(1)).optional(),
    maxModifiedFiles: z.number().int().positive().optional(),
    typescriptDiagnosticsEnabled: z.boolean(),
    persistToolEvidence: z.boolean(),
  }),
  logging: z.strictObject({
    level: logLevelSchema,
    format: logFormatSchema,
  }),
});

const envSchema = z.object({
  LLM_PROVIDER: llmProviderSchema.default('mock'),
  LLM_MODEL: z.string().trim().min(1).default('mock-model'),
  LLM_ROLE_MODELS: z.string().trim().optional(),
  LLM_FALLBACK_MODEL: z.string().trim().min(1).optional(),
  LLM_TOKEN_BUDGET_PER_RUN: z.coerce.number().int().positive().optional(),
  LLM_TOKEN_BUDGET_PER_TASK: z.coerce.number().int().positive().optional(),
  LLM_MAX_RUN_COST_USD_MICRO: z.coerce.number().int().nonnegative().optional(),
  LLM_MODEL_COST_PER_1K_TOKENS_USD_MICRO: z.string().trim().optional(),
  LLM_API_KEY: z.string().trim().min(1).optional(),
  LLM_TEMPERATURE: z.coerce.number().default(0.2),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  STATE_BACKEND: stateBackendSchema.default('postgresql'),
  POSTGRES_DSN: z.string().trim().min(1).default('postgresql://localhost:5432/ai_orchestrator'),
  POSTGRES_SCHEMA: z.string().trim().min(1).default('public'),
  SNAPSHOT_ON_BOOTSTRAP: z.stringbool().default(true),
  SNAPSHOT_ON_TASK_COMPLETION: z.stringbool().default(true),
  SNAPSHOT_ON_MILESTONE_COMPLETION: z.stringbool().default(true),
  MAX_STEPS_PER_RUN: z.coerce.number().int().positive().default(8),
  MAX_ROLE_STEPS_PER_TASK: z.coerce.number().int().positive().optional(),
  MAX_ROLE_WALL_TIME_MS: z.coerce.number().int().positive().optional(),
  MAX_RETRIES_PER_TASK: z.coerce.number().int().nonnegative().default(3),
  WORKFLOW_WORKER_COUNT: z.coerce.number().int().positive().default(1),
  WORKFLOW_RUN_LOCK_PROVIDER: runLockProviderSchema.default('noop'),
  WORKFLOW_RUN_LOCK_DSN: z.string().trim().min(1).optional(),
  WORKFLOW_WORKSPACE_MANAGER_MODE: workspaceManagerModeSchema.default('git-worktree'),
  WORKFLOW_WORKSPACE_BRANCH_TTL_HOURS: z.coerce.number().int().positive().default(24),
  WORKFLOW_QUALITY_GATE_MODE: qualityGateModeSchema.default('tooling'),
  WORKFLOW_APPROVAL_GATE_MODE: approvalGateModeSchema.default('disabled'),
  WORKFLOW_APPROVAL_REQUIRED_ACTIONS: z.string().trim().min(1).default('git_push,pr_draft'),
  WORKFLOW_APPROVAL_BULK_FILE_THRESHOLD: z.coerce.number().int().positive().default(25),
  WORKFLOW_READINESS_SCORECARD_POLICY: z.string().trim().optional(),
  TOOL_ALLOWED_WRITE_PATHS: z.string().trim().min(1).default('.'),
  TOOL_ALLOWED_SHELL_COMMANDS: z.string().trim().min(1).default('node,npm,pnpm,git,rg,tsx,tsc'),
  TOOL_WRITE_MODE: safeWriteModeSchema.default('workspace-write'),
  TOOL_PROTECTED_WRITE_PATHS: z.string().trim().min(1).default('package.json,pnpm-lock.yaml,package-lock.json,.github,.env'),
  TOOL_MAX_MODIFIED_FILES: z.coerce.number().int().positive().default(200),
  TOOL_TYPESCRIPT_DIAGNOSTICS: z.stringbool().default(true),
  TOOL_PERSIST_EVIDENCE: z.stringbool().default(true),
  LOG_LEVEL: logLevelSchema.default('info'),
  LOG_FORMAT: logFormatSchema.default('json'),
  RUNTIME_CONFIG_FILE: z.string().trim().min(1).optional(),
});

export interface LoadRuntimeConfigOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

const runtimeSecretRegistry = new Set<string>();
const WORKFLOW_POLICY_LIMITS = {
  maxStepsPerRun: 200,
  maxRoleStepsPerTask: 200,
  maxRetriesPerTask: 10,
  workspaceBranchTtlHours: 24 * 30,
} as const;

export function loadRuntimeConfig(options: LoadRuntimeConfigOptions = {}): RuntimeConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = envSchema.safeParse(options.env ?? process.env);

  if (!env.success) {
    throw new ConfigError('Invalid runtime environment', {
      details: env.error.issues,
    });
  }

  const fileConfig = loadConfigFile(cwd, env.data.RUNTIME_CONFIG_FILE);
  const merged = {
    llm: {
      provider: env.data.LLM_PROVIDER,
      model: env.data.LLM_MODEL,
      ...(env.data.LLM_ROLE_MODELS ? { roleModels: parseJsonRecord(env.data.LLM_ROLE_MODELS, 'LLM_ROLE_MODELS') } : {}),
      ...(env.data.LLM_FALLBACK_MODEL ? { fallbackModel: env.data.LLM_FALLBACK_MODEL } : {}),
      ...(typeof env.data.LLM_TOKEN_BUDGET_PER_RUN === 'number'
        ? { tokenBudgetPerRun: env.data.LLM_TOKEN_BUDGET_PER_RUN }
        : {}),
      ...(typeof env.data.LLM_TOKEN_BUDGET_PER_TASK === 'number'
        ? { tokenBudgetPerTask: env.data.LLM_TOKEN_BUDGET_PER_TASK }
        : {}),
      ...(typeof env.data.LLM_MAX_RUN_COST_USD_MICRO === 'number'
        ? { maxRunCostUsdMicro: env.data.LLM_MAX_RUN_COST_USD_MICRO }
        : {}),
      ...(env.data.LLM_MODEL_COST_PER_1K_TOKENS_USD_MICRO
        ? {
          modelCostPer1kTokensUsdMicro: parseJsonNumberRecord(
            env.data.LLM_MODEL_COST_PER_1K_TOKENS_USD_MICRO,
            'LLM_MODEL_COST_PER_1K_TOKENS_USD_MICRO',
          ),
        }
        : {}),
      temperature: env.data.LLM_TEMPERATURE,
      timeoutMs: env.data.LLM_TIMEOUT_MS,
      ...(env.data.LLM_API_KEY ? { apiKey: env.data.LLM_API_KEY } : {}),
      ...fileConfig.llm,
    },
    state: {
      ...fileConfig.state,
      backend: env.data.STATE_BACKEND,
      postgresDsn: env.data.POSTGRES_DSN,
      postgresSchema: env.data.POSTGRES_SCHEMA,
      snapshotOnBootstrap: env.data.SNAPSHOT_ON_BOOTSTRAP,
      snapshotOnTaskCompletion: env.data.SNAPSHOT_ON_TASK_COMPLETION,
      snapshotOnMilestoneCompletion: env.data.SNAPSHOT_ON_MILESTONE_COMPLETION,
    },
    workflow: {
      maxStepsPerRun: env.data.MAX_STEPS_PER_RUN,
      ...(typeof env.data.MAX_ROLE_STEPS_PER_TASK === 'number'
        ? { maxRoleStepsPerTask: env.data.MAX_ROLE_STEPS_PER_TASK }
        : {}),
      ...(typeof env.data.MAX_ROLE_WALL_TIME_MS === 'number'
        ? { maxRoleWallTimeMs: env.data.MAX_ROLE_WALL_TIME_MS }
        : {}),
      maxRetriesPerTask: env.data.MAX_RETRIES_PER_TASK,
      workerCount: env.data.WORKFLOW_WORKER_COUNT,
      runLockProvider: env.data.WORKFLOW_RUN_LOCK_PROVIDER,
      ...(env.data.WORKFLOW_RUN_LOCK_DSN ? { runLockDsn: env.data.WORKFLOW_RUN_LOCK_DSN } : {}),
      workspaceManagerMode: env.data.WORKFLOW_WORKSPACE_MANAGER_MODE,
      workspaceBranchTtlHours: env.data.WORKFLOW_WORKSPACE_BRANCH_TTL_HOURS,
      qualityGateMode: env.data.WORKFLOW_QUALITY_GATE_MODE,
      approvalGateMode: env.data.WORKFLOW_APPROVAL_GATE_MODE,
      approvalRequiredActions: normalizeCommaSeparatedValues(
        fileConfig.workflow?.approvalRequiredActions ?? env.data.WORKFLOW_APPROVAL_REQUIRED_ACTIONS,
      ) as z.infer<typeof approvalRequestedActionSchema>[],
      approvalBulkFileThreshold:
        fileConfig.workflow?.approvalBulkFileThreshold ?? env.data.WORKFLOW_APPROVAL_BULK_FILE_THRESHOLD,
      ...(env.data.WORKFLOW_READINESS_SCORECARD_POLICY
        ? {
          readinessScorecardPolicy: parseReadinessScorecardPolicy(
            env.data.WORKFLOW_READINESS_SCORECARD_POLICY,
            'WORKFLOW_READINESS_SCORECARD_POLICY',
          ),
        }
        : {}),
      ...fileConfig.workflow,
    },
    tools: {
      allowedWritePaths: normalizeWritePaths(
        fileConfig.tools?.allowedWritePaths ?? env.data.TOOL_ALLOWED_WRITE_PATHS,
        cwd,
      ),
      allowedShellCommands: normalizeCommaSeparatedValues(
        fileConfig.tools?.allowedShellCommands ?? env.data.TOOL_ALLOWED_SHELL_COMMANDS,
      ),
      writeMode: fileConfig.tools?.writeMode ?? env.data.TOOL_WRITE_MODE,
      protectedWritePaths: normalizeWritePaths(
        fileConfig.tools?.protectedWritePaths ?? env.data.TOOL_PROTECTED_WRITE_PATHS,
        cwd,
      ),
      maxModifiedFiles: fileConfig.tools?.maxModifiedFiles ?? env.data.TOOL_MAX_MODIFIED_FILES,
      typescriptDiagnosticsEnabled:
        fileConfig.tools?.typescriptDiagnosticsEnabled ?? env.data.TOOL_TYPESCRIPT_DIAGNOSTICS,
      persistToolEvidence: fileConfig.tools?.persistToolEvidence ?? env.data.TOOL_PERSIST_EVIDENCE,
    },
    logging: {
      level: env.data.LOG_LEVEL,
      format: env.data.LOG_FORMAT,
      ...fileConfig.logging,
    },
  };

  const parsed = runtimeConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ConfigError('Invalid runtime configuration', {
      details: parsed.error.issues,
    });
  }

  validateRuntimePolicy(parsed.data);
  validatePostgresPolicy(parsed.data);
  validateRuntimeFilesystemGuards(parsed.data);
  registerRuntimeSecrets(collectSecretValues(parsed.data));

  return parsed.data;
}

function parseReadinessScorecardPolicy(
  input: string,
  envName: string,
): { id: string; passThresholdPercent: number; enabledCriteria: z.infer<typeof readinessCriterionIdSchema>[] } {
  const parsed = parseJsonUnknown(input, envName);
  const schema = z.strictObject({
    id: z.string().trim().min(1),
    passThresholdPercent: z.number().int().min(0).max(100),
    enabledCriteria: z.array(readinessCriterionIdSchema).min(1),
  });
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(`${envName} must be a valid readiness policy JSON object`, {
      details: result.error.issues,
    });
  }
  return result.data;
}

function parseJsonRecord(input: string, envName: string): Record<string, string> {
  const parsed = parseJsonUnknown(input, envName);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`${envName} must be a JSON object`);
  }
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ConfigError(`${envName} must map keys to non-empty string values`);
    }
    output[key] = value.trim();
  }
  return output;
}

function parseJsonNumberRecord(input: string, envName: string): Record<string, number> {
  const parsed = parseJsonUnknown(input, envName);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`${envName} must be a JSON object`);
  }
  const output: Record<string, number> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      throw new ConfigError(`${envName} must map keys to non-negative integer values`);
    }
    output[key] = value;
  }
  return output;
}

function parseJsonUnknown(input: string, envName: string): unknown {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new ConfigError(`Unable to parse ${envName} as JSON`, { cause: error });
  }
}

export function redactSecrets<T>(value: T): T {
  return redactSecretsInternal(value) as T;
}

export function registerRuntimeSecrets(secrets: readonly string[]): void {
  for (const secret of secrets) {
    const normalized = secret.trim();
    if (!normalized) {
      continue;
    }

    runtimeSecretRegistry.add(normalized);
  }
}

export function clearRuntimeSecrets(): void {
  runtimeSecretRegistry.clear();
}

function redactSecretsInternal(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecretsInternal(item));
  }

  if (typeof value === 'string') {
    return redactSecretStrings(value);
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSecretKey(key) ? '<redacted>' : redactSecretsInternal(entry);
    }
    return output;
  }

  return value;
}

function normalizeWritePaths(input: string[] | string, cwd: string): string[] {
  const values = Array.isArray(input) ? input : input.split(',');
  return values
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.resolve(cwd, item));
}

function normalizeCommaSeparatedValues(input: string[] | string): string[] {
  const values = Array.isArray(input) ? input : input.split(',');
  return values
    .map((item) => item.trim())
    .filter(Boolean);
}

function loadConfigFile(cwd: string, configFile?: string): Partial<RuntimeConfig> {
  if (!configFile) {
    return {};
  }

  const resolved = path.resolve(cwd, configFile);
  if (!existsSync(resolved)) {
    throw new ConfigError(`Runtime config file does not exist: ${resolved}`);
  }

  try {
    return JSON.parse(readFileSync(resolved, 'utf8')) as Partial<RuntimeConfig>;
  } catch (error) {
    throw new ConfigError(`Unable to parse runtime config file: ${resolved}`, {
      cause: error,
    });
  }
}

function validateRuntimePolicy(config: RuntimeConfig): void {
  const policyIssues: string[] = [];
  const maxRoleStepsPerTask = config.workflow.maxRoleStepsPerTask;
  const workerCount = config.workflow.workerCount ?? 1;
  const runLockProvider = config.workflow.runLockProvider ?? 'noop';
  const runLockDsn = config.workflow.runLockDsn;

  if (config.workflow.maxStepsPerRun > WORKFLOW_POLICY_LIMITS.maxStepsPerRun) {
    policyIssues.push(
      `workflow.maxStepsPerRun must be <= ${WORKFLOW_POLICY_LIMITS.maxStepsPerRun} (received ${config.workflow.maxStepsPerRun})`,
    );
  }

  if (config.workflow.maxRetriesPerTask > WORKFLOW_POLICY_LIMITS.maxRetriesPerTask) {
    policyIssues.push(
      `workflow.maxRetriesPerTask must be <= ${WORKFLOW_POLICY_LIMITS.maxRetriesPerTask} (received ${config.workflow.maxRetriesPerTask})`,
    );
  }

  if (config.workflow.maxRetriesPerTask > config.workflow.maxStepsPerRun) {
    policyIssues.push(
      `workflow.maxRetriesPerTask must be <= workflow.maxStepsPerRun (received retries=${config.workflow.maxRetriesPerTask}, steps=${config.workflow.maxStepsPerRun})`,
    );
  }

  if (
    typeof maxRoleStepsPerTask === 'number' &&
    maxRoleStepsPerTask > WORKFLOW_POLICY_LIMITS.maxRoleStepsPerTask
  ) {
    policyIssues.push(
      `workflow.maxRoleStepsPerTask must be <= ${WORKFLOW_POLICY_LIMITS.maxRoleStepsPerTask} (received ${maxRoleStepsPerTask})`,
    );
  }

  if (
    typeof maxRoleStepsPerTask === 'number' &&
    maxRoleStepsPerTask > config.workflow.maxStepsPerRun
  ) {
    policyIssues.push(
      `workflow.maxRoleStepsPerTask must be <= workflow.maxStepsPerRun (received roleSteps=${maxRoleStepsPerTask}, steps=${config.workflow.maxStepsPerRun})`,
    );
  }

  if (workerCount > 1 && !runLockDsn) {
    policyIssues.push(
      'workflow.runLockDsn is required when workflow.workerCount > 1; all workers must use the same shared DSN',
    );
  }

  if (runLockProvider === 'noop' && workerCount > 1) {
    policyIssues.push(
      'workflow.runLockProvider=noop is only allowed for single-worker mode',
    );
  }

  const workspaceBranchTtlHours = config.workflow.workspaceBranchTtlHours ?? 24;
  if (workspaceBranchTtlHours > WORKFLOW_POLICY_LIMITS.workspaceBranchTtlHours) {
    policyIssues.push(
      `workflow.workspaceBranchTtlHours must be <= ${WORKFLOW_POLICY_LIMITS.workspaceBranchTtlHours} (received ${workspaceBranchTtlHours})`,
    );
  }

  const lockDsnIssue = validateRunLockDsn(runLockProvider, runLockDsn);
  if (lockDsnIssue) {
    policyIssues.push(lockDsnIssue);
  }

  if (policyIssues.length > 0) {
    throw new ConfigError('Invalid runtime workflow policy', {
      details: policyIssues,
    });
  }
}

function validateRunLockDsn(
  provider: z.infer<typeof runLockProviderSchema>,
  dsn?: string,
): string | null {
  if (provider === 'noop') {
    return dsn ? 'workflow.runLockDsn must be omitted when workflow.runLockProvider=noop' : null;
  }

  if (!dsn) {
    return `workflow.runLockDsn is required when workflow.runLockProvider=${provider}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(dsn);
  } catch (error) {
    return `workflow.runLockDsn must be a valid URL (${formatPathValidationError(error)})`;
  }

  const expectedSchemes: Record<'postgresql' | 'redis' | 'etcd', string[]> = {
    postgresql: ['postgres:', 'postgresql:'],
    redis: ['redis:', 'rediss:'],
    etcd: ['etcd:', 'etcds:'],
  };

  const supportedSchemes = expectedSchemes[provider];
  if (!supportedSchemes.includes(parsed.protocol)) {
    return `workflow.runLockDsn must use ${supportedSchemes.join(' or ')} for provider ${provider} (received ${parsed.protocol})`;
  }

  return null;
}

function validateRuntimeFilesystemGuards(config: RuntimeConfig): void {
  const writePathIssues = config.tools.allowedWritePaths.flatMap((writePath) =>
    validateWritableDirectory(writePath, 'tools.allowedWritePaths'),
  );
  const protectedPathIssues = (config.tools.protectedWritePaths ?? []).flatMap((writePath) =>
    validateWritablePath(writePath, 'tools.protectedWritePaths'),
  );
  const issues = [...writePathIssues, ...protectedPathIssues];
  if (issues.length > 0) {
    throw new ConfigError('Invalid runtime writable path policy', {
      details: issues,
    });
  }
}

function validatePostgresPolicy(config: RuntimeConfig): void {
  if (config.state.backend !== 'postgresql') {
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(config.state.postgresDsn);
  } catch (error) {
    throw new ConfigError('Invalid PostgreSQL configuration', {
      details: [`state.postgresDsn must be a valid URL (${formatPathValidationError(error)})`],
    });
  }

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new ConfigError('Invalid PostgreSQL configuration', {
      details: [`state.postgresDsn must use postgres:// or postgresql:// scheme (received ${parsedUrl.protocol})`],
    });
  }

  const databaseName = parsedUrl.pathname.replace(/^\//, '').trim();
  if (!databaseName) {
    throw new ConfigError('Invalid PostgreSQL configuration', {
      details: ['state.postgresDsn must include a database name in URL path'],
    });
  }
}

function validateWritableDirectory(directoryPath: string, scope: string): string[] {
  if (existsSync(directoryPath)) {
    try {
      const stat = statSync(directoryPath);
      if (!stat.isDirectory()) {
        return [`${scope} path must be a directory: ${directoryPath}`];
      }
      accessSync(directoryPath, fsConstants.W_OK);
      return [];
    } catch (error) {
      return [`${scope} directory must be writable: ${directoryPath} (${formatPathValidationError(error)})`];
    }
  }

  const nearestExistingAncestor = findNearestExistingAncestor(directoryPath);
  if (!nearestExistingAncestor) {
    return [`${scope} path has no existing writable ancestor: ${directoryPath}`];
  }

  try {
    accessSync(nearestExistingAncestor, fsConstants.W_OK);
    return [];
  } catch (error) {
    return [
      `${scope} path must be writable via ancestor ${nearestExistingAncestor}: ${directoryPath} (${formatPathValidationError(error)})`,
    ];
  }
}

function validateWritablePath(targetPath: string, scope: string): string[] {
  if (existsSync(targetPath)) {
    try {
      accessSync(targetPath, fsConstants.W_OK);
      return [];
    } catch (error) {
      return [`${scope} path must be writable: ${targetPath} (${formatPathValidationError(error)})`];
    }
  }

  const parentPath = path.dirname(targetPath);
  return validateWritableDirectory(parentPath, scope);
}

function formatPathValidationError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'unknown filesystem access error';
}

function findNearestExistingAncestor(directoryPath: string): string | null {
  let currentPath = path.resolve(directoryPath);

  while (!existsSync(currentPath)) {
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }

  return currentPath;
}

function isSecretKey(key: string): boolean {
  return /(key|token|secret|password|dsn)/i.test(key);
}

function redactSecretStrings(value: string): string {
  let sanitized = redactRegisteredSecrets(value);

  sanitized = sanitized.replace(/(?<![a-zA-Z0-9_-])sk-(?:proj-)?[a-zA-Z0-9_-]{20,}(?![a-zA-Z0-9_-])/g, '<redacted>');
  sanitized = sanitized.replace(/(bearer\s+)[a-zA-Z0-9._-]{16,}/gi, '$1<redacted>');
  sanitized = sanitized.replace(
    /\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)(['"]?)([^'",\s]+)\3/gi,
    (match, key: string, separator: string, quote: string, assignedValue: string) => {
      if (!shouldRedactAssignedValue(assignedValue)) {
        return match;
      }

      return `${key}${separator}${quote}<redacted>${quote}`;
    },
  );

  return sanitized;
}

function shouldRedactAssignedValue(value: string): boolean {
  return value.length >= 8 || value.includes('-') || value.includes('_');
}

function collectSecretValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSecretValues(item));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const secrets: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSecretKey(key) && typeof entry === 'string' && entry.trim()) {
      secrets.push(entry);
      continue;
    }

    secrets.push(...collectSecretValues(entry));
  }

  return secrets;
}

function redactRegisteredSecrets(value: string): string {
  const secrets = [...runtimeSecretRegistry].sort((left, right) => right.length - left.length);
  let sanitized = value;

  for (const secret of secrets) {
    sanitized = sanitized.replace(new RegExp(escapeRegExp(secret), 'g'), '<redacted>');
  }

  return sanitized;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
