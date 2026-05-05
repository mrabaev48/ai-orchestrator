import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

interface FixturePackageInput {
  readonly scope: 'apps' | 'packages';
  readonly directoryName: string;
  readonly packageName: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly files: Readonly<Record<string, string>>;
}

test('package boundary checker accepts public declared workspace imports', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'shared',
      packageName: '@ai-orchestrator/shared',
      files: {
        'src/index.ts': 'export const sharedValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'core',
      packageName: '@ai-orchestrator/core',
      dependencies: { '@ai-orchestrator/shared': 'workspace:*' },
      files: {
        'src/index.ts': "import { sharedValue } from '@ai-orchestrator/shared';\nexport const coreValue = sharedValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.equal(result.status, 0);
    assert.match(result.output, /Package boundary check passed/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects cross-package relative imports', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      files: {
        'src/index.ts': 'export const appValue = 1;\n',
      },
    },
    {
      scope: 'apps',
      directoryName: 'control-plane',
      packageName: '@ai-orchestrator/control-plane',
      dependencies: { '@ai-orchestrator/application': 'workspace:*' },
      files: {
        'src/index.ts': "import { appValue } from '../../../packages/application/src/index.js';\nexport const cliValue = appValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /CROSS_PACKAGE_RELATIVE_IMPORT/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects undeclared workspace dependencies', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'core',
      packageName: '@ai-orchestrator/core',
      files: {
        'src/index.ts': 'export const coreValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      files: {
        'src/index.ts': "import { coreValue } from '@ai-orchestrator/core';\nexport const appValue = coreValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /UNDECLARED_WORKSPACE_DEPENDENCY/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects forbidden layer dependencies', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      files: {
        'src/index.ts': 'export const appValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'state',
      packageName: '@ai-orchestrator/state',
      dependencies: { '@ai-orchestrator/application': 'workspace:*' },
      files: {
        'src/index.ts': "import { appValue } from '@ai-orchestrator/application';\nexport const stateValue = appValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /FORBIDDEN_LAYER_DEPENDENCY/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects application depending on runtime adapters', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'agents',
      packageName: '@ai-orchestrator/agents',
      files: {
        'src/index.ts': 'export const agentValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      dependencies: { '@ai-orchestrator/agents': 'workspace:*' },
      files: {
        'src/index.ts': "import { agentValue } from '@ai-orchestrator/agents';\nexport const appValue = agentValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /FORBIDDEN_LAYER_DEPENDENCY/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects application depending on outer runtime composition', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'runtime',
      packageName: '@ai-orchestrator/runtime',
      files: {
        'src/index.ts': 'export const runtimeValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      dependencies: { '@ai-orchestrator/runtime': 'workspace:*' },
      files: {
        'src/index.ts': "import { runtimeValue } from '@ai-orchestrator/runtime';\nexport const appValue = runtimeValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /FORBIDDEN_LAYER_DEPENDENCY/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker accepts runtime as the outer composition root', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      files: {
        'src/index.ts': 'export const appValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'agents',
      packageName: '@ai-orchestrator/agents',
      files: {
        'src/index.ts': 'export const agentValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'execution',
      packageName: '@ai-orchestrator/execution',
      files: {
        'src/index.ts': 'export const executionValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'state',
      packageName: '@ai-orchestrator/state',
      files: {
        'src/index.ts': 'export const stateValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'runtime',
      packageName: '@ai-orchestrator/runtime',
      dependencies: {
        '@ai-orchestrator/application': 'workspace:*',
        '@ai-orchestrator/agents': 'workspace:*',
        '@ai-orchestrator/execution': 'workspace:*',
        '@ai-orchestrator/state': 'workspace:*',
      },
      files: {
        'src/index.ts': "import { appValue } from '@ai-orchestrator/application';\nimport { agentValue } from '@ai-orchestrator/agents';\nimport { executionValue } from '@ai-orchestrator/execution';\nimport { stateValue } from '@ai-orchestrator/state';\nexport const runtimeValue = appValue + agentValue + executionValue + stateValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.equal(result.status, 0);
    assert.match(result.output, /Package boundary check passed/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('package boundary checker rejects workspace package subpaths', () => {
  const fixtureRoot = createFixture([
    {
      scope: 'packages',
      directoryName: 'core',
      packageName: '@ai-orchestrator/core',
      files: {
        'src/index.ts': 'export const coreValue = 1;\n',
        'src/internal.ts': 'export const internalValue = 1;\n',
      },
    },
    {
      scope: 'packages',
      directoryName: 'application',
      packageName: '@ai-orchestrator/application',
      dependencies: { '@ai-orchestrator/core': 'workspace:*' },
      files: {
        'src/index.ts': "import { internalValue } from '@ai-orchestrator/core/src/internal.js';\nexport const appValue = internalValue;\n",
      },
    },
  ]);

  try {
    const result = runBoundaryChecker(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /FORBIDDEN_WORKSPACE_SUBPATH/u);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function createFixture(packages: readonly FixturePackageInput[]): string {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'package-boundaries-'));

  for (const workspaceScope of ['apps', 'packages'] as const) {
    mkdirSync(path.join(fixtureRoot, workspaceScope), { recursive: true });
  }

  for (const fixturePackage of packages) {
    const packageRoot = path.join(fixtureRoot, fixturePackage.scope, fixturePackage.directoryName);
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      path.join(packageRoot, 'package.json'),
      `${JSON.stringify({
        name: fixturePackage.packageName,
        type: 'module',
        dependencies: fixturePackage.dependencies ?? {},
      }, null, 2)}\n`,
    );

    for (const [relativePath, contents] of Object.entries(fixturePackage.files)) {
      const filePath = path.join(packageRoot, relativePath);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, contents);
    }
  }

  return fixtureRoot;
}

function runBoundaryChecker(fixtureRoot: string): { readonly status: number | null; readonly output: string } {
  try {
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/check-package-boundaries.ts', fixtureRoot],
      { cwd: path.resolve('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { status: 0, output };
  } catch (error) {
    if (!isExecError(error)) {
      throw error;
    }

    return {
      status: error.status,
      output: `${error.stdout}${error.stderr}`,
    };
  }
}

function isExecError(error: unknown): error is { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  return typeof error === 'object'
    && error !== null
    && 'status' in error
    && 'stdout' in error
    && 'stderr' in error;
}
