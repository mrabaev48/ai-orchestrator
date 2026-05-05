# Composition Root Lives Inside Application Layer

## Issue ID
002

## Severity
High

## Category
Architecture, Domain Modeling, Module Boundaries, Dependency Management, Configuration, Maintainability

## Summary
The application layer constructs concrete infrastructure, role implementations, and the execution orchestrator. This inverts Clean Architecture boundaries by making application services responsible for adapter selection and runtime wiring.

## Evidence
- `packages/application/src/runtime-factory.ts` imports concrete role classes from `packages/agents`, `Orchestrator` from `packages/execution`, and concrete stores from `packages/state`.
- `createApplicationContext` constructs `RoleRegistry`, `StateStore`, and `Orchestrator` directly.
- `createStateStore` switches between `InMemoryStateStore` and `PostgresStateStore` using runtime config inside the application package.
- `apps/control-plane/src/cli.ts`, `apps/worker/src/main.ts`, and `apps/dashboard-api/src/read-model/read-model.module.ts` depend on this application-layer factory for runtime assembly.

## Why This Is a Problem
Application code should express use cases and depend on ports. Infrastructure decisions such as PostgreSQL vs memory, concrete role implementations, lock providers, and orchestrator construction belong in an outer composition root. Keeping wiring in `application` makes the use-case layer depend on adapters and runtime concerns.

## Risk
- New adapters or role providers require application-layer modifications.
- Tests that should exercise use cases through ports inherit infrastructure construction behavior.
- The application package becomes a central dependency magnet.
- Replacing state, execution, or role providers becomes a cross-layer change.

## Recommended Direction
Move runtime assembly to app-level composition roots or a dedicated infrastructure/bootstrap package. Keep `application` limited to use-case services and interfaces that are implemented by outer layers.

## Suggested Refactoring Steps
1. Define application-level ports for state, role registry, and execution coordination where needed.
2. Move `createApplicationContext`, `createRoleRegistry`, and `createStateStore` out of `packages/application`.
3. Let each app compose concrete adapters in its own bootstrap module.
4. Keep application services constructed from interfaces only.
5. Add tests that instantiate application services with test doubles rather than production factories.

## Acceptance Criteria for Resolution
- `packages/application` no longer imports from `packages/agents`, `packages/execution`, or concrete `packages/state` adapters.
- Runtime adapter selection happens in app/bootstrap code.
- Use-case services can be tested with ports and no infrastructure constructors.
- Dependency direction is `apps/infrastructure -> application -> core`, not the reverse.
