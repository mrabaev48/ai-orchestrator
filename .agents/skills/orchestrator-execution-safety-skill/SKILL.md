---
name: orchestrator-execution-safety
description: audit execution safety for typescript ai orchestration packages in a pnpm monorepo that uses turbo, vitest, eslint, and tsc. use when the user asks to review retries, timeouts, cancellation, idempotency, duplicate execution, partial failures, state safety, or runtime risk in orchestration code or pull requests. prefer this skill for focused safety reviews rather than general feature implementation.
---

# Orchestrator Execution Safety

Review execution paths in orchestration packages for runtime safety, failure handling, and operational robustness.

## Scope

Use this skill for focused analysis of:
- retry semantics
- timeout enforcement
- cancellation behavior
- idempotency
- duplicate execution risk
- partial failures
- state consistency during failure and recovery
- structured error propagation
- observability relevant to runtime debugging

This skill is for safety review. It is not the default skill for routine feature implementation.

## Review workflow

1. Identify the exact execution path under review.
2. Inspect the modules that control retries, timeouts, cancellation, state transitions, side effects, and tool execution.
3. Evaluate runtime safety using the checklists in `references/safety-review.md`.
4. Identify concrete failure scenarios, not abstract concerns.
5. Distinguish:
   - confirmed defects
   - credible risks
   - optional hardening ideas
6. Recommend the smallest credible corrections first.
7. If the user asks for code changes as part of the safety review, keep fixes narrow and validation-focused.

## Review standards

### Required focus
Evaluate:
- whether retries are explicit and bounded
- whether timeouts are enforced and surfaced
- whether cancellation can strand work or state
- whether side effects are safe under retry
- whether duplicate execution can occur
- whether failures are recoverable or at least diagnosable
- whether state transitions remain valid under error conditions
- whether tracing/logging make incidents reconstructable

### Constraints
- Do not broaden into general style review.
- Do not propose large rewrites unless the current design is fundamentally unsafe.
- Do not treat speculative performance micro-optimizations as safety issues.
- Do not claim a risk is confirmed unless the code actually supports that conclusion.

## Validation expectations

When the user asks for fixes, validate with Turbo:
- `turbo run lint`
- `turbo run test`
- `turbo run typecheck`
- `turbo run build`

If blockers outside scope prevent a clean run, stop and report them precisely.

## Required response format

Always use this structure:

1. Thinking/Understanding
2. Plan
3. Changes
4. Validation
5. Risks
6. Git status

For pure review tasks with no code changes, use:
- "Changes: no code changes made"
- "Git status: unchanged"

## Resources

- See `references/safety-review.md` for the core checklist and review heuristics.
