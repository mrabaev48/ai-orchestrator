# AGENTS.md

## Project
This repository contains `ai-orchestrator`, a production-oriented orchestration system for coordinating AI tasks, tool execution, routing, state transitions, and execution observability.

## Operating principles
- Prefer correctness, determinism, and debuggability over cleverness.
- Preserve architectural boundaries.
- Make the smallest safe change that fully solves the task.
- Do not introduce hidden side effects.
- Keep orchestration logic separate from transport, storage, and provider-specific adapters.
- Favor explicit contracts, narrow interfaces, and strong typing.
- Preserve backward compatibility unless the task explicitly allows breaking changes.

## Architecture rules
- Core orchestration domain must remain framework-agnostic.
- Provider/model integrations belong in adapters, not in domain logic.
- Tool execution must go through typed interfaces and structured results.
- State transitions must be explicit and reviewable.
- Retries, timeouts, cancellation, and error classification are part of the implementation, not follow-up work.
- Logging/tracing/metrics must be structured and correlated by run/task identifiers.
- Configuration must not be hardcoded; use existing config patterns.

## Code change policy
- First inspect relevant files and summarize the current design before editing.
- Reuse existing abstractions where possible.
- Avoid speculative refactors unless required by the task.
- If the task reveals architectural debt, note it separately from the requested change.
- Do not silently rename public interfaces or move files unless necessary.

## Testing policy
For every non-trivial change:
- run targeted tests first
- then run broader validation if the change affects shared orchestration paths
- add or update tests for:
  - success path
  - failure path
  - timeout/cancellation path if applicable
  - idempotency/retry behavior if applicable

## Required validation
Before finishing, always:
- run typecheck
- run lint
- run relevant tests
- report exact commands run
- report any skipped checks and why they were skipped

## Output format
Always respond in this structure:
1. Understanding
2. Plan
3. Changes made
4. Validation run
5. Risks / follow-ups

## Git workflow
When work is complete:
- check git status
- commit only if asked or if the task explicitly requests a commit
- if working in a Codex worktree branch, confirm whether the branch has an upstream
- if asked to publish, push with upstream and report the branch / PR status

## Safety against drift
Do not:
- invent nonexistent files, modules, or commands
- claim tests passed unless they were actually run
- describe a refactor as complete if only partial migration was done
- mark work done if build, lint, or core tests are failing without explicitly stating that