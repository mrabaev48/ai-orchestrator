# 12 — Review & testing contracts (`ReviewResult`, `TestExecutionResult`)

## Goal

Define structured review and testing result models that act as gates (not “suggestions”) and formally drive workflow transitions.

## Context and business logic

Review determines whether a role output is acceptable. Testing validates behavior. Any blocker in review → `approved=false`. Inability to fully test must be explicit rather than hidden.

## Requirements

### Functional

- `ReviewResult` (минимум):
  - `approved: boolean`
  - `blockingIssues: string[]`
  - `nonBlockingSuggestions: string[]`
  - `missingTests: string[]`
  - `notes: string[]` (optional)
- `TestExecutionResult` (минимум):
  - `passed: boolean`
  - `testPlan: string[]` (scenarios)
  - `evidence: string[]` (what was run / what was checked)
  - `failures: string[]`
  - `missingCoverage: string[]`
- Rules:
  - any blocker → approved=false
  - for behavior changes, missing test plan must be surfaced

### Non-functional

- Models must be suitable for structured LLM output and for logging/persistence.

## Stack

- TypeScript

## Implementation details

- `packages/core/review/*` and `packages/core/testing/*` (or equivalent)
- `packages/workflow`:
  - `review` stage branches on `approved`
  - `test` stage branches on `passed`

## Definition of Done (DoD)

- The Orchestrator correctly stops or routes to the retry path when `approved=false` or `passed=false`.
- For the happy path, state commit is possible.

## Test plan

- Unit: branching logic checks (approved/passed)
- Integration: “Reviewer rejection path” and “Tester failure path” scenarios

## Documentation links

- Spec v3: Phase 8 Review: [`docs/ai-orchestrator-spec-v3.md` §15.9](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Phase 9 Testing: [`docs/ai-orchestrator-spec-v3.md` §15.10](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Review policy: [`docs/ai-orchestrator-spec-v3.md` §17.3](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: Testing policy: [`docs/ai-orchestrator-spec-v3.md` §17.4](../../docs/ai-orchestrator-spec-v3.md)

