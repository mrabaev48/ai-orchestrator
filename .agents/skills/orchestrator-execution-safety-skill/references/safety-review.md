# Safety Review Checklist

Use this checklist to review orchestration runtime paths.

## Retry
- Is retry policy explicit?
- Is retry bounded?
- Can retry duplicate external or tool side effects?
- Is retry state isolated from previous attempts?
- Are retry decisions observable?

## Timeout
- Is timeout enforced at the right boundary?
- Is timeout propagated clearly to callers?
- Can timeout leave hidden work continuing in the background?
- Are timed-out tasks safe to retry?

## Cancellation
- Can cancellation interrupt state transitions halfway through?
- Can cancellation leave orphaned work, locks, or queued actions?
- Is cancellation surfaced in a typed, diagnosable way?

## Idempotency and duplicate execution
- Are side effects idempotent?
- If not idempotent, are they guarded with deduplication or attempt tracking?
- Could replay, retry, or race conditions execute the same step twice?

## Failure handling
- Are errors normalized and classified?
- Can operators understand what failed and where?
- Is recovery possible or at least deterministic?

## Observability
- Are run and task identifiers present?
- Can logs and traces reconstruct the failing path?
- Are critical decisions and transitions visible?

## Output guidance
Prefer precise findings in three buckets:
- Confirmed defect
- Credible risk
- Optional hardening
