# Tool Execution Policy Is Not Bound To Workspace Context

## Issue ID
008

## Severity
Medium

## Category
Runtime Safety, Module Boundaries, Configuration, API Contracts, Observability

## Summary
Tool execution validates command names and write paths, but shell and testing adapters do not carry an explicit workspace or working-directory contract. Quality gates are invoked through generic shell execution and can run in the process working directory instead of the managed workspace.

## Evidence
- `packages/tools/src/shell/adapter.ts` calls `execFileAsync(allowlistedCommand, args, ...)` without a `cwd`.
- `packages/tools/src/testing/adapter.ts` delegates `testing_run` to `shell_exec` and also does not pass a `cwd`.
- `packages/agents/src/default-roles.ts` invokes quality stages with `command: 'npm'` and `args: ['run', stage]` rather than using the configured package manager or workspace root.
- `packages/tools/src/policy/adapter.ts` allowlists command names but does not validate command arguments against operation-specific policies.
- `RoleExecutionContext` contains `toolExecution.workspaceRoot`, but the generic tool request does not require or enforce it.

## Why This Is a Problem
Execution safety depends on running commands against the correct isolated workspace. If shell commands and tests do not carry a required workspace root, validation can occur against the wrong checkout, or side effects can occur outside the managed workspace. A command-name allowlist is also too coarse for high-risk operations such as `git`, `npm`, or `pnpm`.

## Risk
- Quality gates may pass or fail based on the wrong directory.
- Tool side effects can escape the allocated workspace.
- A broadly allowlisted command can perform unsafe operations through arguments.
- Evidence may not correspond to the actual task workspace.

## Recommended Direction
Make workspace root an explicit required part of tool execution. Tool adapters should receive an execution context with `cwd`, allowed paths, policy profile, and argument-level constraints.

## Suggested Refactoring Steps
1. Add `cwd` or `workspaceRoot` to the unified tool execution options.
2. Require shell/testing adapters to execute inside that workspace.
3. Replace generic command allowlists with per-tool operation policies.
4. Make quality gates use configured commands from runtime config.
5. Record workspace root and command metadata in tool evidence.

## Acceptance Criteria for Resolution
- Shell and testing commands cannot run without an explicit workspace.
- Quality gates run against the allocated workspace path.
- Command policies validate both command and arguments for high-risk tools.
- Tool evidence includes workspace context.
- Tests cover wrong-cwd prevention and workspace escape attempts.
