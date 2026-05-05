# Production readiness review

## Purpose

`evaluateProductionReadinessReview(...)` provides a deterministic final gate for autonomous task execution. It classifies failed checks into `blocker` and `warning`, then emits an explicit `ready`/`not_ready` verdict with structured evidence.

## Contract

Input (`ReadinessReviewInput`):
- `runId`: execution run identifier.
- `reviewDateIso`: ISO timestamp of the review.
- `checks[]`: list of readiness checks with typed severity (`blocker`|`warning`) and pass/fail signal.

Output (`ReadinessReviewResult`):
- `verdict`: `not_ready` if at least one failed blocker exists, otherwise `ready`.
- `blockers[]` and `warnings[]`: normalized issues suitable for operator triage.
- `evidence`: aggregate counters for diagnosability (`total`, `passed`, `failed`, `blockerCount`, `warningCount`).

## Safety behavior

- Deterministic-first: same payload produces the same verdict and evidence.
- Explicit state: readiness is represented by a closed verdict union (`ready`|`not_ready`).
- Structured diagnostics: every failed check is preserved with `checkId`, `title`, `details`.

## Usage

Use this module as the final readiness gate after verification and before release/publish side effects.
