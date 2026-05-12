# Validation Pipeline Does Not Provide Real Monorepo Isolation

## Issue ID
012

## Severity
Medium

## Category
Testing, Configuration, Dependency Management, Maintainability, Scalability

## Summary
The repository now uses pnpm workspaces, the real Turbo CLI, package-level scripts, and TypeScript project references. The remaining isolation risk is that root-level validation tests can still bypass package public APIs unless the boundary checker treats those tests as an external validation surface.

## Evidence
- `package.json` depends on the real `turbo` CLI and exposes explicit package/root validation phases (`lint:packages`, `lint:root`, `typecheck:packages`, `typecheck:root`, `test:packages`, `test:integration`).
- `pnpm-workspace.yaml` declares workspace packages under `packages/*` and `apps/*`.
- `turbo.json` schedules package-level `lint`, `typecheck`, `test`, and `build` tasks using declared workspace dependencies.
- `tsconfig.json` is a solution-style project reference graph instead of a single broad include.
- Root tests are now covered by `scripts/check-package-boundaries.ts`, so relative imports into `packages/*/src` and workspace subpath imports are rejected.
- Package-local tests can run independently through their package `test` scripts when colocated tests exist.

## Why This Is a Problem
As the repository grows, validation must keep package contracts explicit. Root integration tests are useful, but they must behave like external consumers of package APIs; otherwise a test can pass by importing internals that a package consumer cannot access.

## Risk
- CI confidence decreases if root tests bypass package public exports.
- Package dependency drift remains invisible unless boundary checks inspect both workspace sources and validation tests.
- Tests can pass against internals that are not exported through package manifests.

## Recommended Direction
Keep real package-aware validation with pnpm workspaces, Turbo, and TypeScript project references. Treat root integration tests as external consumers and enforce public package APIs through boundary checks.

## Suggested Refactoring Steps
1. Keep package-local `lint`, `typecheck`, `test`, and `build` scripts as the Turbo scheduling unit.
2. Keep root integration tests separate from package tests with explicit `test:integration` and `test:packages` scripts.
3. Reject root-test imports that reach into workspace internals by relative path or workspace subpath.
4. Promote any test-required internals to intentional public exports.
5. Configure CI to run affected-package validation plus full validation where required.

## Acceptance Criteria for Resolution
- Turbo runs package-level tasks based on declared package dependencies.
- TypeScript catches cross-package dependency violations.
- Root validation no longer masks missing package dependencies.
- Package tests can be run independently.
- CI can run affected validation deterministically.
