#!/usr/bin/env node

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'build');
const sourceRoots = ['apps', 'packages'];
const skippedDirectories = new Set(['node_modules', '.git', 'build', 'dist', 'coverage']);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const sourceRoot of sourceRoots) {
  await compileDirectory(path.join(rootDir, sourceRoot));
}

await writeFile(
  path.join(outDir, 'package.json'),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
  'utf8',
);

async function compileDirectory(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        await compileDirectory(entryPath);
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }

    await compileFile(entryPath);
  }
}

async function compileFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  const relativePath = path.relative(rootDir, filePath);
  const outputPath = path.join(outDir, relativePath).replace(/\.ts$/, '.js');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      esModuleInterop: true,
      sourceMap: false,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });

  const diagnostics = output.diagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error(formatDiagnostics(diagnostics));
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rewriteTsSpecifiers(output.outputText), 'utf8');
}

function rewriteTsSpecifiers(outputText) {
  return outputText
    .replaceAll(/((?:from\s+|import\(\s*)['"])([^'"]+)\.ts(['"])/g, '$1$2.js$3')
    .replaceAll(/(\bimport\s+['"])([^'"]+)\.ts(['"])/g, '$1$2.js$3');
}

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => '\n',
  });
}
