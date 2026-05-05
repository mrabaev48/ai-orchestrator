# Package Boundaries Are Not Enforced

## Issue ID
001

## Severity
High

## Category
Architecture, Module Boundaries, Dependency Management, Maintainability, Scalability

## Summary
The repository is organized as `packages/*` and `apps/*`, but the packages are not real workspace packages with independent manifests, public entrypoints, or dependency declarations. Internal modules import each other through deep relative `src` paths, so layer boundaries are convention rather than enforceable architecture.

## Evidence
- `package.json` has no `workspaces` field and no per-package package manifests under `packages/*`.
- `tsconfig.json` compiles `apps/**/*.ts`, `packages/**/*.ts`, and `tests/**/*.ts` as one TypeScript program.
- Cross-package imports use deep relative source paths, for example `packages/execution/src/orchestrator.ts` imports from `../../core/src/index.ts`, `../../state/src/index.ts`, `../../tools/src/index.ts`, `../../workflow/src/index.ts`, and `../../agents/src/index.ts`.
- App imports also reach directly into package source files, for example `apps/control-plane/src/cli.ts` imports from `../../../packages/application/src/index.ts` and `apps/dashboard-api/src/read-model/read-model.module.ts` imports from `../../../../packages/application/src/index.ts`.
- `turbo.json` defines task names, but package-level tasks cannot be isolated because packages do not define their own scripts.

## Why This Is a Problem
The codebase presents itself as a monorepo, but dependency ownership is not explicit. Any module can import any other package internals, including non-public files, without crossing a declared package API. This prevents independent package validation, makes refactoring risky, and hides dependency direction violations until runtime or broad typecheck failures.

## Risk
- Accidental circular dependencies and boundary violations can grow unchecked.
- Public contracts cannot be distinguished from internal implementation details.
- Package-level builds, tests, and releases cannot scale as the repository grows.
- Apps can become coupled to internal package layout, making file moves breaking changes.

## Recommended Direction
Turn `packages/*` and `apps/*` into explicit pnpm workspace packages with package manifests, exports maps, and declared dependencies. Import package APIs by package name, not deep relative paths, and enforce boundaries with TypeScript project references or lint rules.

## Suggested Refactoring Steps
1. Add a root `pnpm-workspace.yaml` and per-package `package.json` files.
2. Define public exports for each package.
3. Replace deep relative cross-package imports with package imports.
4. Add dependency constraints so inner layers do not import outer layers.
5. Configure Turbo to run package-local `lint`, `test`, `typecheck`, and `build` tasks.

## Acceptance Criteria for Resolution
- Every package has a manifest with explicit dependencies and exports.
- Cross-package imports use package names and public exports only.
- Typecheck can run by package or project reference.
- Boundary violations fail CI.
- Apps no longer import package internals through `packages/*/src/*` paths.
