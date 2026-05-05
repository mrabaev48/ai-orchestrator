# Validation Pipeline Does Not Provide Real Monorepo Isolation

## Issue ID
012

## Severity
Medium

## Category
Testing, Configuration, Dependency Management, Maintainability, Scalability

## Summary
The validation setup looks like a Turbo monorepo pipeline, but it is implemented as root-level scripts over one TypeScript program. This prevents changed-package validation, dependency-aware task execution, and package-level isolation.

## Evidence
- `package.json` defines `"turbo": "node scripts/turbo-runner.mjs"` rather than depending on the real Turbo CLI.
- `scripts/turbo-runner.mjs` sequentially runs root `pnpm run lint`, `pnpm run typecheck`, `pnpm run test`, and `pnpm run build`.
- `turbo.json` declares task dependencies, but there are no package-local scripts or workspaces for Turbo to schedule.
- `tsconfig.json` includes all apps, packages, and tests in one compilation unit.
- Tests are run with `node --import tsx --test tests/**/*.test.ts` from the root instead of package-scoped test tasks.

## Why This Is a Problem
As the repository grows, validation will become slower and less precise. More importantly, package boundaries are not exercised by the build system: a package can accidentally depend on another package's internals and still pass because everything is compiled together.

## Risk
- CI cannot validate only affected packages.
- Package dependency drift remains invisible.
- Tests can pass because root-level setup masks missing package dependencies.
- Operational confidence decreases as the repository scales.

## Recommended Direction
Use real package-aware validation with pnpm workspaces, Turbo, and TypeScript project references. Each package should own its scripts, tests, and public API surface.

## Suggested Refactoring Steps
1. Add real workspace configuration and package-level manifests.
2. Replace the custom Turbo shim with the actual Turbo CLI or clearly rename it as a root validation script.
3. Add package-local `lint`, `typecheck`, `test`, and `build` scripts.
4. Introduce TypeScript project references for package boundaries.
5. Configure CI to run affected-package validation plus full validation where required.

## Acceptance Criteria for Resolution
- Turbo runs package-level tasks based on declared package dependencies.
- TypeScript catches cross-package dependency violations.
- Root validation no longer masks missing package dependencies.
- Package tests can be run independently.
- CI can run affected validation deterministically.
