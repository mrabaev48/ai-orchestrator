import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { ConfigError } from '../errors/index.ts';

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const logFormatSchema = z.enum(['json']);
const llmProviderSchema = z.enum(['openai', 'anthropic', 'mock']);
const stateBackendSchema = z.enum(['memory', 'sqlite']);

const runtimeConfigSchema = z.strictObject({
  llm: z.strictObject({
    provider: llmProviderSchema,
    model: z.string().trim().min(1),
    apiKey: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2),
    timeoutMs: z.number().int().positive(),
  }),
  state: z.strictObject({
    backend: stateBackendSchema,
    sqlitePath: z.string().trim().min(1),
    snapshotOnBootstrap: z.boolean(),
    snapshotOnTaskCompletion: z.boolean(),
    snapshotOnMilestoneCompletion: z.boolean(),
  }),
  workflow: z.strictObject({
    maxStepsPerRun: z.number().int().positive(),
    maxRetriesPerTask: z.number().int().nonnegative(),
  }),
  tools: z.strictObject({
    allowedWritePaths: z.array(z.string().trim().min(1)).min(1),
    typescriptDiagnosticsEnabled: z.boolean(),
  }),
  logging: z.strictObject({
    level: logLevelSchema,
    format: logFormatSchema,
  }),
});

const envSchema = z.object({
  LLM_PROVIDER: llmProviderSchema.default('mock'),
  LLM_MODEL: z.string().trim().min(1).default('mock-model'),
  LLM_API_KEY: z.string().trim().min(1).optional(),
  LLM_TEMPERATURE: z.coerce.number().default(0.2),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  STATE_BACKEND: stateBackendSchema.default('sqlite'),
  SQLITE_PATH: z.string().trim().min(1).default('.ai-orchestrator/state.db'),
  SNAPSHOT_ON_BOOTSTRAP: z.stringbool().default(true),
  SNAPSHOT_ON_TASK_COMPLETION: z.stringbool().default(true),
  SNAPSHOT_ON_MILESTONE_COMPLETION: z.stringbool().default(true),
  MAX_STEPS_PER_RUN: z.coerce.number().int().positive().default(8),
  MAX_RETRIES_PER_TASK: z.coerce.number().int().nonnegative().default(3),
  TOOL_ALLOWED_WRITE_PATHS: z.string().trim().min(1).default('.'),
  TOOL_TYPESCRIPT_DIAGNOSTICS: z.stringbool().default(true),
  LOG_LEVEL: logLevelSchema.default('info'),
  LOG_FORMAT: logFormatSchema.default('json'),
  RUNTIME_CONFIG_FILE: z.string().trim().min(1).optional(),
});

export interface LoadRuntimeConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

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
      apiKey: env.data.LLM_API_KEY,
      temperature: env.data.LLM_TEMPERATURE,
      timeoutMs: env.data.LLM_TIMEOUT_MS,
      ...fileConfig.llm,
    },
    state: {
      backend: env.data.STATE_BACKEND,
      sqlitePath: path.resolve(cwd, env.data.SQLITE_PATH),
      snapshotOnBootstrap: env.data.SNAPSHOT_ON_BOOTSTRAP,
      snapshotOnTaskCompletion: env.data.SNAPSHOT_ON_TASK_COMPLETION,
      snapshotOnMilestoneCompletion: env.data.SNAPSHOT_ON_MILESTONE_COMPLETION,
      ...fileConfig.state,
      sqlitePath: path.resolve(cwd, fileConfig.state?.sqlitePath ?? env.data.SQLITE_PATH),
    },
    workflow: {
      maxStepsPerRun: env.data.MAX_STEPS_PER_RUN,
      maxRetriesPerTask: env.data.MAX_RETRIES_PER_TASK,
      ...fileConfig.workflow,
    },
    tools: {
      allowedWritePaths: normalizeWritePaths(
        fileConfig.tools?.allowedWritePaths ?? env.data.TOOL_ALLOWED_WRITE_PATHS,
        cwd,
      ),
      typescriptDiagnosticsEnabled:
        fileConfig.tools?.typescriptDiagnosticsEnabled ?? env.data.TOOL_TYPESCRIPT_DIAGNOSTICS,
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

  return parsed.data;
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item)) as T;
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSecretKey(key) ? '<redacted>' : redactSecrets(entry);
    }
    return output as T;
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

function isSecretKey(key: string): boolean {
  return /(key|token|secret|password|dsn)/i.test(key);
}
