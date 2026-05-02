import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  clearRuntimeSecrets,
  ConfigError,
  loadRuntimeConfig,
  redactSecrets,
  registerRuntimeSecrets,
} from '../packages/shared/src/index.ts';

test.afterEach(() => {
  clearRuntimeSecrets();
});

test('loadRuntimeConfig applies defaults and normalizes paths', () => {
  const config = loadRuntimeConfig({
    cwd: '/tmp/workspace',
    env: {
      LLM_PROVIDER: 'mock',
      LLM_MODEL: 'gpt-test',
      TOOL_ALLOWED_WRITE_PATHS: 'src,tests',
    },
  });

  assert.equal(config.workflow.maxStepsPerRun, 8);
  assert.equal(config.workflow.maxRoleStepsPerTask, undefined);
  assert.equal(config.workflow.workspaceManagerMode, 'git-worktree');
  assert.equal(config.workflow.workspaceBranchTtlHours, 24);
  assert.equal(config.workflow.qualityGateMode, 'tooling');
  assert.equal(config.tools.allowedWritePaths[0], '/tmp/workspace/src');
  assert.equal(config.tools.allowedWritePaths[1], '/tmp/workspace/tests');
  assert.equal(config.tools.allowedShellCommands.includes('node'), true);
  assert.equal(config.tools.writeMode, 'workspace-write');
  assert.equal(config.tools.maxModifiedFiles, 200);
  assert.equal(config.tools.persistToolEvidence, true);
});

test('loadRuntimeConfig normalizes allowlisted shell commands', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      TOOL_ALLOWED_SHELL_COMMANDS: 'git, pnpm , node',
    },
  });

  assert.deepEqual(config.tools.allowedShellCommands, ['git', 'pnpm', 'node']);
});

test('loadRuntimeConfig supports model strategy and cost control settings', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      LLM_ROLE_MODELS: '{"planner":"gpt-4.1-mini","coder":"gpt-4.1"}',
      LLM_FALLBACK_MODEL: 'gpt-4.1-nano',
      LLM_TOKEN_BUDGET_PER_RUN: '5000',
      LLM_TOKEN_BUDGET_PER_TASK: '2500',
      LLM_MAX_RUN_COST_USD_MICRO: '200000',
      LLM_MODEL_COST_PER_1K_TOKENS_USD_MICRO: '{"gpt-4.1":3000,"gpt-4.1-mini":1200}',
    },
  });

  assert.equal(config.llm.roleModels?.planner, 'gpt-4.1-mini');
  assert.equal(config.llm.fallbackModel, 'gpt-4.1-nano');
  assert.equal(config.llm.tokenBudgetPerRun, 5000);
  assert.equal(config.llm.tokenBudgetPerTask, 2500);
  assert.equal(config.llm.maxRunCostUsdMicro, 200000);
  assert.equal(config.llm.modelCostPer1kTokensUsdMicro?.['gpt-4.1'], 3000);
});

test('loadRuntimeConfig supports safe write mode and guardrail settings', () => {
  const config = loadRuntimeConfig({
    cwd: '/tmp/workspace',
    env: {
      TOOL_ALLOWED_WRITE_PATHS: 'src',
      TOOL_WRITE_MODE: 'sandbox-write',
      TOOL_PROTECTED_WRITE_PATHS: 'package.json,.github',
      TOOL_MAX_MODIFIED_FILES: '7',
    },
  });

  assert.equal(config.tools.writeMode, 'sandbox-write');
  assert.equal(config.tools.maxModifiedFiles, 7);
  assert.deepEqual(config.tools.protectedWritePaths, [
    '/tmp/workspace/package.json',
    '/tmp/workspace/.github',
  ]);
});

test('loadRuntimeConfig supports distributed lock configuration', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_WORKER_COUNT: '3',
      WORKFLOW_RUN_LOCK_PROVIDER: 'postgresql',
      WORKFLOW_RUN_LOCK_DSN: 'postgresql://localhost:5432/ai_orchestrator',
    },
  });

  assert.equal(config.workflow.workerCount, 3);
  assert.equal(config.workflow.runLockProvider, 'postgresql');
  assert.equal(config.workflow.runLockDsn, 'postgresql://localhost:5432/ai_orchestrator');
});

test('loadRuntimeConfig supports workspace manager mode and ttl configuration', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_WORKSPACE_MANAGER_MODE: 'static',
      WORKFLOW_WORKSPACE_BRANCH_TTL_HOURS: '12',
    },
  });

  assert.equal(config.workflow.workspaceManagerMode, 'static');
  assert.equal(config.workflow.workspaceBranchTtlHours, 12);
});

test('loadRuntimeConfig supports quality gate mode configuration', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_QUALITY_GATE_MODE: 'synthetic',
    },
  });

  assert.equal(config.workflow.qualityGateMode, 'synthetic');
});

test('loadRuntimeConfig supports configurable approval required actions', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_APPROVAL_GATE_MODE: 'enabled',
      WORKFLOW_APPROVAL_REQUIRED_ACTIONS: 'git_push,db_migration,file_delete',
      WORKFLOW_APPROVAL_BULK_FILE_THRESHOLD: '15',
    },
  });

  assert.equal(config.workflow.approvalGateMode, 'enabled');
  assert.deepEqual(config.workflow.approvalRequiredActions, ['git_push', 'db_migration', 'file_delete']);
  assert.equal(config.workflow.approvalBulkFileThreshold, 15);
});

test('loadRuntimeConfig supports configurable readiness scorecard policy', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_READINESS_SCORECARD_POLICY:
        '{"id":"prod-v2","passThresholdPercent":80,"enabledCriteria":["repo-tests","repo-typecheck","execution-blockers"]}',
    },
  });

  assert.equal(config.workflow.readinessScorecardPolicy?.id, 'prod-v2');
  assert.equal(config.workflow.readinessScorecardPolicy?.passThresholdPercent, 80);
  assert.deepEqual(config.workflow.readinessScorecardPolicy?.enabledCriteria, [
    'repo-tests',
    'repo-typecheck',
    'execution-blockers',
  ]);
});

test('loadRuntimeConfig rejects multi-worker mode without shared run lock dsn', () => {
  const error = assertConfigError(() =>
    loadRuntimeConfig({
      env: {
        TOOL_ALLOWED_WRITE_PATHS: '.',
        WORKFLOW_WORKER_COUNT: '2',
        WORKFLOW_RUN_LOCK_PROVIDER: 'postgresql',
      },
    }),
  );

  assert.deepEqual(error.details, [
    'workflow.runLockDsn is required when workflow.workerCount > 1; all workers must use the same shared DSN',
    'workflow.runLockDsn is required when workflow.runLockProvider=postgresql',
  ]);
});

test('loadRuntimeConfig rejects noop lock provider in multi-worker mode', () => {
  const error = assertConfigError(() =>
    loadRuntimeConfig({
      env: {
        TOOL_ALLOWED_WRITE_PATHS: '.',
        WORKFLOW_WORKER_COUNT: '2',
        WORKFLOW_RUN_LOCK_PROVIDER: 'noop',
      },
    }),
  );

  assert.deepEqual(error.details, [
    'workflow.runLockDsn is required when workflow.workerCount > 1; all workers must use the same shared DSN',
    'workflow.runLockProvider=noop is only allowed for single-worker mode',
  ]);
});

test('loadRuntimeConfig rejects provider and dsn scheme mismatch in multi-worker mode', () => {
  const error = assertConfigError(() =>
    loadRuntimeConfig({
      env: {
        TOOL_ALLOWED_WRITE_PATHS: '.',
        WORKFLOW_WORKER_COUNT: '2',
        WORKFLOW_RUN_LOCK_PROVIDER: 'redis',
        WORKFLOW_RUN_LOCK_DSN: 'postgresql://localhost:5432/ai_orchestrator',
      },
    }),
  );

  assert.deepEqual(error.details, [
    'workflow.runLockDsn must use redis: or rediss: for provider redis (received postgresql:)',
  ]);
});

test('loadRuntimeConfig accepts multi-worker redis lock with shared dsn', () => {
  const config = loadRuntimeConfig({
    env: {
      TOOL_ALLOWED_WRITE_PATHS: '.',
      WORKFLOW_WORKER_COUNT: '4',
      WORKFLOW_RUN_LOCK_PROVIDER: 'redis',
      WORKFLOW_RUN_LOCK_DSN: 'redis://localhost:6379/0',
    },
  });

  assert.equal(config.workflow.workerCount, 4);
  assert.equal(config.workflow.runLockProvider, 'redis');
  assert.equal(config.workflow.runLockDsn, 'redis://localhost:6379/0');
});

test('loadRuntimeConfig rejects invalid numeric values', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '0',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects workflow values outside policy bounds', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '201',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects workspace branch ttl outside policy bounds', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          TOOL_ALLOWED_WRITE_PATHS: '.',
          WORKFLOW_WORKSPACE_BRANCH_TTL_HOURS: '721',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects retry cap larger than step cap', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '2',
          MAX_RETRIES_PER_TASK: '3',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig accepts explicit role-step budget', () => {
  const config = loadRuntimeConfig({
    env: {
      MAX_STEPS_PER_RUN: '12',
      MAX_ROLE_STEPS_PER_TASK: '4',
      TOOL_ALLOWED_WRITE_PATHS: '.',
    },
  });

  assert.equal(config.workflow.maxRoleStepsPerTask, 4);
});


test('loadRuntimeConfig accepts explicit role wall-time budget', () => {
  const config = loadRuntimeConfig({
    env: {
      MAX_STEPS_PER_RUN: '12',
      MAX_ROLE_WALL_TIME_MS: '15000',
      TOOL_ALLOWED_WRITE_PATHS: '.',
    },
  });

  assert.equal(config.workflow.maxRoleWallTimeMs, 15000);
});

test('loadRuntimeConfig rejects role-step budget larger than run-step budget', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          MAX_STEPS_PER_RUN: '4',
          MAX_ROLE_STEPS_PER_TASK: '5',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects non-directory write path scopes', () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-runtime-config-file-path-'));
  const filePath = path.join(tempDir, 'not-a-directory.txt');
  writeFileSync(filePath, 'x', 'utf8');

  assert.throws(
    () =>
      loadRuntimeConfig({
        cwd: tempDir,
        env: {
          TOOL_ALLOWED_WRITE_PATHS: filePath,
        },
      }),
    ConfigError,
  );
});

test('loadRuntimeConfig rejects invalid postgresql dsn scheme', () => {
  assert.throws(
    () =>
      loadRuntimeConfig({
        env: {
          STATE_BACKEND: 'postgresql',
          POSTGRES_DSN: 'mysql://localhost/db',
          TOOL_ALLOWED_WRITE_PATHS: '.',
        },
      }),
    ConfigError,
  );
});

test('redactSecrets removes secret-like keys recursively', () => {
  const redacted = redactSecrets({
    apiKey: 'secret',
    nested: {
      token: 'abc',
      ok: 'value',
    },
  });

  assert.deepEqual(redacted, {
    apiKey: '<redacted>',
    nested: {
      token: '<redacted>',
      ok: 'value',
    },
  });
});

test('redactSecrets masks common provider secret string formats', () => {
  const redacted = redactSecrets({
    authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
    prompt: 'Use key sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ123456 and continue',
    inline: 'api_key: super-secret-value',
  });

  assert.deepEqual(redacted, {
    authorization: 'Bearer <redacted>',
    prompt: 'Use key <redacted> and continue',
    inline: 'api_key: <redacted>',
  });
});

test('redactSecrets avoids replacing likely non-secret short assignments', () => {
  const redacted = redactSecrets({
    text: 'Please create a token=done marker and keep going',
  });

  assert.deepEqual(redacted, {
    text: 'Please create a token=done marker and keep going',
  });
});

test('redactSecrets masks explicitly registered runtime secrets', () => {
  registerRuntimeSecrets(['provider-credential-not-matching-fallback']);

  const redacted = redactSecrets({
    prompt: 'Credential: provider-credential-not-matching-fallback',
  });

  assert.deepEqual(redacted, {
    prompt: 'Credential: <redacted>',
  });
});

test('loadRuntimeConfig auto-registers configured secret fields for string redaction', () => {
  loadRuntimeConfig({
    env: {
      LLM_PROVIDER: 'openai',
      LLM_MODEL: 'gpt-4.1',
      LLM_API_KEY: 'provider-runtime-secret-001',
      TOOL_ALLOWED_WRITE_PATHS: '.',
    },
  });

  const redacted = redactSecrets('LLM secret provider-runtime-secret-001');
  assert.equal(redacted, 'LLM secret <redacted>');
});

function assertConfigError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error;
  }

  assert.fail('Expected ConfigError to be thrown');
}
