# Role Runtime Is Hardcoded And Partly Stubbed

## Issue ID
007

## Severity
Medium

## Category
Architecture, API Contracts, Extensibility, Maintainability, Runtime Safety

## Summary
Agent roles are concrete classes registered directly in application wiring, and key runtime roles are deterministic stubs rather than provider-backed execution components. The LLM package defines only a mock client and is not integrated into role execution.

## Evidence
- `packages/application/src/runtime-factory.ts` directly registers `BootstrapAnalystRole`, `ArchitectRole`, `PlannerRole`, `CoderRole`, `ReviewerRole`, `TesterRole`, and other concrete classes.
- `packages/agents/src/default-roles.ts` contains many role implementations in one file.
- `CoderRole.execute` returns `{ changed: true, summary: "Stub execution completed..." }` without using tools or an LLM provider.
- `ReviewerRole.execute` approves unless an acceptance criterion contains `[reject]`.
- `packages/llm/src/index.ts` only exposes `LlmClient` and `MockLlmClient`; no production provider adapter is wired into role execution.

## Why This Is a Problem
The project models an AI orchestrator, but role execution is not separated behind provider or strategy ports. Concrete role construction is hardcoded and runtime behavior can mark tasks as changed, reviewed, and tested without actual implementation work. This weakens public execution contracts and makes provider replacement difficult.

## Risk
- Tasks may be marked complete without real code changes.
- Review and testing signals can be misleading in operational dashboards.
- Adding provider-backed roles requires editing core wiring and concrete role classes.
- Runtime behavior in tests can diverge from production expectations.

## Recommended Direction
Introduce role provider ports and separate deterministic test roles from production-capable agent roles. Role implementations should either execute real tool/LLM workflows or report a non-production capability explicitly.

## Suggested Refactoring Steps
1. Define role execution ports that can be backed by LLM, tool-driven, or deterministic test adapters.
2. Move stub roles into a test or synthetic-runtime package.
3. Make production role registration configuration-driven.
4. Require roles to return evidence for claimed changes, reviews, and tests.
5. Add startup validation that refuses production mode with stub role providers.

## Acceptance Criteria for Resolution
- Production wiring does not register stub roles by default.
- LLM/provider-backed role execution is integrated through typed ports.
- Task completion requires evidence of actual mutation or explicit no-op handling.
- Tests can still use deterministic roles without affecting production wiring.
- Role capabilities are visible in configuration and logs.
