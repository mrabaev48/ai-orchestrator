import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

type WorkspaceKind = 'app' | 'package';

interface WorkspacePackage {
  readonly kind: WorkspaceKind;
  readonly name: string;
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly dependencies: ReadonlySet<string>;
}

interface ImportLocation {
  readonly filePath: string;
  readonly specifier: string;
  readonly line: number;
  readonly column: number;
}

export interface BoundaryViolation {
  readonly code:
    | 'CROSS_PACKAGE_RELATIVE_IMPORT'
    | 'UNDECLARED_WORKSPACE_DEPENDENCY'
    | 'FORBIDDEN_LAYER_DEPENDENCY'
    | 'FORBIDDEN_WORKSPACE_SUBPATH';
  readonly message: string;
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
}

export interface BoundaryCheckResult {
  readonly ok: boolean;
  readonly violations: readonly BoundaryViolation[];
}

const WORKSPACE_SCOPES = ['apps', 'packages'] as const;

const ALLOWED_WORKSPACE_DEPENDENCIES = new Map<string, ReadonlySet<string>>([
  ['@ai-orchestrator/shared', new Set()],
  ['@ai-orchestrator/core', new Set(['@ai-orchestrator/shared'])],
  ['@ai-orchestrator/workflow', new Set(['@ai-orchestrator/core'])],
  ['@ai-orchestrator/prompts', new Set(['@ai-orchestrator/core', '@ai-orchestrator/shared'])],
  [
    '@ai-orchestrator/agents',
    new Set([
      '@ai-orchestrator/core',
      '@ai-orchestrator/prompts',
      '@ai-orchestrator/workflow',
      '@ai-orchestrator/shared',
    ]),
  ],
  ['@ai-orchestrator/state', new Set(['@ai-orchestrator/core', '@ai-orchestrator/shared'])],
  ['@ai-orchestrator/tools', new Set(['@ai-orchestrator/shared'])],
  [
    '@ai-orchestrator/execution',
    new Set([
      '@ai-orchestrator/core',
      '@ai-orchestrator/shared',
      '@ai-orchestrator/state',
      '@ai-orchestrator/tools',
      '@ai-orchestrator/workflow',
      '@ai-orchestrator/agents',
    ]),
  ],
  [
    '@ai-orchestrator/application',
    new Set([
      '@ai-orchestrator/core',
      '@ai-orchestrator/shared',
      '@ai-orchestrator/prompts',
      '@ai-orchestrator/tools',
    ]),
  ],
  [
    '@ai-orchestrator/runtime',
    new Set([
      '@ai-orchestrator/agents',
      '@ai-orchestrator/application',
      '@ai-orchestrator/core',
      '@ai-orchestrator/execution',
      '@ai-orchestrator/llm',
      '@ai-orchestrator/shared',
      '@ai-orchestrator/state',
    ]),
  ],
  ['@ai-orchestrator/llm', new Set()],
  ['@ai-orchestrator/control-plane', new Set(['@ai-orchestrator/application', '@ai-orchestrator/runtime', '@ai-orchestrator/shared'])],
  [
    '@ai-orchestrator/dashboard-api',
    new Set([
      '@ai-orchestrator/application',
      '@ai-orchestrator/core',
      '@ai-orchestrator/runtime',
      '@ai-orchestrator/state',
      '@ai-orchestrator/shared',
    ]),
  ],
  ['@ai-orchestrator/worker', new Set(['@ai-orchestrator/application', '@ai-orchestrator/runtime', '@ai-orchestrator/shared'])],
]);

export function checkPackageBoundaries(rootDir: string = process.cwd()): BoundaryCheckResult {
  const workspacePackages = discoverWorkspacePackages(rootDir);
  const packageByName = new Map(workspacePackages.map((workspacePackage) => [workspacePackage.name, workspacePackage]));
  const sourceFiles = workspacePackages.flatMap((workspacePackage) =>
    listTypeScriptFiles(path.join(workspacePackage.rootDir, 'src')),
  );
  const violations: BoundaryViolation[] = [];

  for (const filePath of sourceFiles) {
    const sourceOwner = findOwner(filePath, workspacePackages);
    const imports = readModuleSpecifiers(filePath);

    for (const importLocation of imports) {
      const workspaceImport = parseWorkspaceImport(importLocation.specifier, packageByName);
      if (workspaceImport) {
        if (workspaceImport.hasSubpath) {
          violations.push(createViolation('FORBIDDEN_WORKSPACE_SUBPATH', importLocation, `Import ${importLocation.specifier} bypasses the public package export.`));
          continue;
        }
        if (sourceOwner && sourceOwner.name !== workspaceImport.packageName) {
          validateDeclaredDependency(sourceOwner, workspaceImport.packageName, importLocation, violations);
          validateLayerDependency(sourceOwner, workspaceImport.packageName, importLocation, violations);
        }
        continue;
      }

      if (!importLocation.specifier.startsWith('.')) {
        continue;
      }

      const targetPath = resolveRelativeModule(filePath, importLocation.specifier);
      if (!targetPath) {
        continue;
      }

      const targetOwner = findOwner(targetPath, workspacePackages);
      if (sourceOwner && targetOwner && sourceOwner.name !== targetOwner.name) {
        violations.push(createViolation(
          'CROSS_PACKAGE_RELATIVE_IMPORT',
          importLocation,
          `Relative import crosses from ${sourceOwner.name} into ${targetOwner.name}. Use ${targetOwner.name} public exports instead.`,
        ));
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

function discoverWorkspacePackages(rootDir: string): readonly WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];

  for (const scope of WORKSPACE_SCOPES) {
    const scopeDir = path.join(rootDir, scope);
    if (!existsSync(scopeDir)) {
      continue;
    }

    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageRootDir = path.join(scopeDir, entry.name);
      const manifestPath = path.join(packageRootDir, 'package.json');
      if (!existsSync(manifestPath)) {
        continue;
      }

      const manifest = readPackageManifest(manifestPath);
      packages.push({
        kind: scope === 'apps' ? 'app' : 'package',
        name: manifest.name,
        rootDir: packageRootDir,
        manifestPath,
        dependencies: manifest.dependencies,
      });
    }
  }

  return packages;
}

function readPackageManifest(manifestPath: string): { readonly name: string; readonly dependencies: ReadonlySet<string> } {
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  if (!isRecord(parsed) || typeof parsed.name !== 'string') {
    throw new Error(`Invalid package manifest: ${manifestPath}`);
  }

  const dependencyNames = [
    ...readDependencyBlock(parsed.dependencies),
    ...readDependencyBlock(parsed.devDependencies),
    ...readDependencyBlock(parsed.peerDependencies),
  ];

  return {
    name: parsed.name,
    dependencies: new Set(dependencyNames),
  };
}

function readDependencyBlock(value: unknown): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  return Object.keys(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listTypeScriptFiles(directoryPath: string): readonly string[] {
  if (!existsSync(directoryPath)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'dist' && entry.name !== 'node_modules') {
        files.push(...listTypeScriptFiles(entryPath));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(entryPath);
    }
  }

  return files;
}

function readModuleSpecifiers(filePath: string): readonly ImportLocation[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports: ImportLocation[] = [];

  const capture = (specifier: ts.StringLiteralLike): void => {
    const position = sourceFile.getLineAndCharacterOfPosition(specifier.getStart(sourceFile));
    imports.push({
      filePath,
      specifier: specifier.text,
      line: position.line + 1,
      column: position.character + 1,
    });
  };

  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      capture(node.moduleSpecifier);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const firstArgument = node.arguments[0];
      if (firstArgument && ts.isStringLiteralLike(firstArgument)) {
        capture(firstArgument);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return imports;
}

function parseWorkspaceImport(
  specifier: string,
  packageByName: ReadonlyMap<string, WorkspacePackage>,
): { readonly packageName: string; readonly hasSubpath: boolean } | undefined {
  if (!specifier.startsWith('@ai-orchestrator/')) {
    return undefined;
  }

  const [scope, packageSegment, ...subpath] = specifier.split('/');
  if (!scope || !packageSegment) {
    return undefined;
  }

  const packageName = `${scope}/${packageSegment}`;
  if (!packageByName.has(packageName)) {
    return undefined;
  }

  return {
    packageName,
    hasSubpath: subpath.length > 0,
  };
}

function validateDeclaredDependency(
  sourceOwner: WorkspacePackage,
  targetPackageName: string,
  importLocation: ImportLocation,
  violations: BoundaryViolation[],
): void {
  if (sourceOwner.dependencies.has(targetPackageName)) {
    return;
  }

  violations.push(createViolation(
    'UNDECLARED_WORKSPACE_DEPENDENCY',
    importLocation,
    `${sourceOwner.name} imports ${targetPackageName} but does not declare it in ${path.relative(process.cwd(), sourceOwner.manifestPath)}.`,
  ));
}

function validateLayerDependency(
  sourceOwner: WorkspacePackage,
  targetPackageName: string,
  importLocation: ImportLocation,
  violations: BoundaryViolation[],
): void {
  const allowedDependencies = ALLOWED_WORKSPACE_DEPENDENCIES.get(sourceOwner.name);
  if (allowedDependencies?.has(targetPackageName)) {
    return;
  }

  violations.push(createViolation(
    'FORBIDDEN_LAYER_DEPENDENCY',
    importLocation,
    `${sourceOwner.name} is not allowed to depend on ${targetPackageName}.`,
  ));
}

function resolveRelativeModule(filePath: string, specifier: string): string | undefined {
  const resolvedBasePath = path.resolve(path.dirname(filePath), specifier);
  const candidates = specifier.endsWith('.js') || specifier.endsWith('.ts')
    ? [resolvedBasePath.replace(/\.js$/, '.ts')]
    : [resolvedBasePath, `${resolvedBasePath}.ts`, path.join(resolvedBasePath, 'index.ts')];

  return candidates.find((candidate) => existsSync(candidate));
}

function findOwner(filePath: string, workspacePackages: readonly WorkspacePackage[]): WorkspacePackage | undefined {
  const normalizedPath = path.resolve(filePath);
  return workspacePackages.find((workspacePackage) =>
    normalizedPath === workspacePackage.rootDir || normalizedPath.startsWith(`${workspacePackage.rootDir}${path.sep}`),
  );
}

function createViolation(
  code: BoundaryViolation['code'],
  importLocation: ImportLocation,
  message: string,
): BoundaryViolation {
  return {
    code,
    message,
    filePath: importLocation.filePath,
    line: importLocation.line,
    column: importLocation.column,
  };
}

function formatViolation(rootDir: string, violation: BoundaryViolation): string {
  const location = `${path.relative(rootDir, violation.filePath)}:${violation.line}:${violation.column}`;
  return `${location} ${violation.code} ${violation.message}`;
}

function runCli(): void {
  const rootDir = path.resolve(process.argv[2] ?? process.cwd());
  const result = checkPackageBoundaries(rootDir);
  if (result.ok) {
    console.log('Package boundary check passed.');
    return;
  }

  console.error(`Package boundary check failed with ${result.violations.length} violation(s):`);
  for (const violation of result.violations) {
    console.error(formatViolation(rootDir, violation));
  }
  process.exitCode = 1;
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url) {
  runCli();
}
