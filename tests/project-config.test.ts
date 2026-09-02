import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProjectConfig,
  budgetsConfigSchema,
  projectConfigSchema,
  resolveEffectiveConfig,
  toolsConfigSchema,
  workflowConfigSchema,
  type ProjectConfig,
  type ProjectConfigOverride,
} from '@ai-orchestrator/core';
import { ConfigError } from '@ai-orchestrator/shared';

function assertThrowsWithIssue(fn: () => void, pathSegment: string, messagePattern: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof ConfigError, 'expected a ConfigError');
    const details: unknown = error.details;
    assert.ok(Array.isArray(details), 'expected error.details to be an array');
    const items: unknown[] = details;

    const hasMatchingIssue = items.some((issue: unknown) => {
      if (typeof issue !== 'object' || issue === null) {
        return false;
      }
      const record = issue as Record<string, unknown>;
      if (!Array.isArray(record.path)) {
        return false;
      }
      const pathSegments: unknown[] = record.path;
      const path = pathSegments.map(String).join('.');
      const message = typeof record.message === 'string' ? record.message : '';
      return path.includes(pathSegment) && messagePattern.test(message);
    });

    assert.ok(hasMatchingIssue, `expected an issue at "${pathSegment}" matching ${messagePattern}`);
    return true;
  });
}

function makeProjectConfig(overrides: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectId: 'project-1',
    version: 1,
    workflow: {
      maxStepsPerRun: 10,
      maxRetriesPerTask: 2,
      approvalGateMode: 'disabled',
      approvalRequiredActions: [],
      approvalBulkFileThreshold: 25,
    },
    tools: {
      writeMode: 'workspace-write',
      allowedWritePaths: ['.'],
      protectedWritePaths: [],
      allowedShellCommands: ['git'],
      maxModifiedFiles: 200,
    },
    budgets: {
      tokens: { perRun: 100_000 },
      money: {},
    },
    ...overrides,
  };
}

test('projectConfigSchema parses a valid ProjectConfig and round-trips', () => {
  const config = makeProjectConfig();
  const parsed = projectConfigSchema.parse(config);
  assert.deepEqual(parsed, config);
});

test('projectConfigSchema rejects an unknown top-level key', () => {
  const result = projectConfigSchema.safeParse({ ...makeProjectConfig(), unknownField: true });
  assert.equal(result.success, false);
});

test('workflowConfigSchema rejects an unknown nested key', () => {
  const result = workflowConfigSchema.safeParse({
    ...makeProjectConfig().workflow,
    unknownField: true,
  });
  assert.equal(result.success, false);
});

test('toolsConfigSchema rejects an unknown nested key', () => {
  const result = toolsConfigSchema.safeParse({ ...makeProjectConfig().tools, unknownField: true });
  assert.equal(result.success, false);
});

test('budgetsConfigSchema rejects an unknown nested key', () => {
  const result = budgetsConfigSchema.safeParse({
    ...makeProjectConfig().budgets,
    unknownField: true,
  });
  assert.equal(result.success, false);
});

test('assertProjectConfig accepts a valid ProjectConfig', () => {
  assert.doesNotThrow(() => {
    assertProjectConfig(makeProjectConfig());
  });
});

test('assertProjectConfig rejects a negative version with a ConfigError', () => {
  assertThrowsWithIssue(
    () => {
      assertProjectConfig({ ...makeProjectConfig(), version: -1 });
    },
    'version',
    /greater than or equal to 0|nonnegative|too small/i,
  );
});

test('resolveEffectiveConfig with only project returns project values merged over defaults', () => {
  const project = makeProjectConfig();
  const effective = resolveEffectiveConfig(undefined, project);

  assert.equal(effective.workflow.maxStepsPerRun, project.workflow.maxStepsPerRun);
  assert.equal(effective.tools.writeMode, project.tools.writeMode);
  assert.equal(effective.budgets.tokens.perRun, project.budgets.tokens.perRun);
  // A field the project doesn't override falls back to the built-in default.
  assert.equal(effective.tools.maxModifiedFiles, 200);
});

test('resolveEffectiveConfig: run overrides agent overrides project overrides instance', () => {
  const project = makeProjectConfig({
    workflow: { ...makeProjectConfig().workflow, maxStepsPerRun: 10 },
  });
  const instance: ProjectConfigOverride = { workflow: { maxStepsPerRun: 50 } };
  const agent: ProjectConfigOverride = { workflow: { maxStepsPerRun: 20 } };
  const run: ProjectConfigOverride = { workflow: { maxStepsPerRun: 5 } };

  assert.equal(resolveEffectiveConfig(instance, project).workflow.maxStepsPerRun, 10);
  assert.equal(resolveEffectiveConfig(instance, project, agent).workflow.maxStepsPerRun, 20);
  assert.equal(resolveEffectiveConfig(instance, project, agent, run).workflow.maxStepsPerRun, 5);
});

test('resolveEffectiveConfig: workflow/tools are fully required on ProjectConfig, so the project layer always supersedes instance for those sections', () => {
  const project = makeProjectConfig();
  const instance: ProjectConfigOverride = { tools: { maxModifiedFiles: 7 } };

  const effective = resolveEffectiveConfig(instance, project);
  // project.tools.maxModifiedFiles (200) is a required field, so it always wins over instance —
  // instance can only fill in leaves that the project layer genuinely leaves unset (budgets'
  // optional leaves, modelRoutingRef). See the next two tests.
  assert.equal(effective.tools.maxModifiedFiles, project.tools.maxModifiedFiles);
});

test('resolveEffectiveConfig: an optional field set only at instance survives when project leaves it unset', () => {
  const project = makeProjectConfig();
  const instance: ProjectConfigOverride = {
    budgets: { tokens: { perDay: 500_000 } },
    modelRoutingRef: 'org-default-routing',
  };

  const effective = resolveEffectiveConfig(instance, project);
  assert.equal(effective.budgets.tokens.perDay, 500_000);
  assert.equal(effective.modelRoutingRef, 'org-default-routing');
  // project's own budgets.tokens.perRun is untouched by the instance layer.
  assert.equal(effective.budgets.tokens.perRun, project.budgets.tokens.perRun);
});

test('resolveEffectiveConfig: absent optional layers do not throw and preserve earlier contributions', () => {
  const project = makeProjectConfig();
  const instance: ProjectConfigOverride = { budgets: { tokens: { perDay: 250_000 } } };

  assert.doesNotThrow(() => {
    resolveEffectiveConfig(instance, project, undefined, undefined);
  });
  const effective = resolveEffectiveConfig(instance, project, undefined, undefined);
  assert.equal(effective.budgets.tokens.perDay, 250_000);
});

test('resolveEffectiveConfig replaces array fields wholesale, does not merge/concat', () => {
  const project = makeProjectConfig({
    tools: { ...makeProjectConfig().tools, allowedWritePaths: ['./src', './packages'] },
  });
  const run: ProjectConfigOverride = { tools: { allowedWritePaths: ['./only-this'] } };

  const effective = resolveEffectiveConfig(undefined, project, undefined, run);
  assert.deepEqual(effective.tools.allowedWritePaths, ['./only-this']);
});

test('resolveEffectiveConfig merges nested budgets one level deep', () => {
  const project = makeProjectConfig({
    budgets: { tokens: { perRun: 1000, perTask: 500 }, money: { perRunUsdMicro: 42 } },
  });
  const run: ProjectConfigOverride = { budgets: { tokens: { perRun: 10 } } };

  const effective = resolveEffectiveConfig(undefined, project, undefined, run);
  assert.equal(effective.budgets.tokens.perRun, 10);
  // Sibling budget fields survive the partial override.
  assert.equal(effective.budgets.tokens.perTask, 500);
  assert.equal(effective.budgets.money.perRunUsdMicro, 42);
});

test('resolveEffectiveConfig throws ConfigError with array details for an invalid merged result', () => {
  const project = makeProjectConfig();
  const invalidRun = { workflow: { maxStepsPerRun: -1 } } as unknown as ProjectConfigOverride;

  assertThrowsWithIssue(
    () => {
      resolveEffectiveConfig(undefined, project, undefined, invalidRun);
    },
    'maxStepsPerRun',
    /greater than 0|positive|too small/i,
  );
});
