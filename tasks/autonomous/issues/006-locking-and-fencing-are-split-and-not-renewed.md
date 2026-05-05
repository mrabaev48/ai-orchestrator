# Locking And Fencing Are Split And Not Renewed

## Issue ID
006

## Severity
High

## Category
Runtime Safety, State Management, Scalability, Reliability, Configuration

## Summary
Run locking and fencing are implemented as separate mechanisms with separate providers and TTL behavior. The runtime validates the fencing lease only before execution, and there is no renewal or periodic validation during long-running work.

## Evidence
- `packages/execution/src/lock-authority.ts` defines `LockAuthority` implementations for noop, PostgreSQL advisory locks, Redis, and etcd.
- `packages/execution/src/locks/distributed-lock-store-factory.ts` separately creates `DistributedLockStore` implementations for fencing using Redis, PostgreSQL, etcd, or in-memory.
- `packages/execution/src/orchestrator.ts` acquires a run lock and then acquires a fencing lock for `global-run-cycle`.
- `packages/execution/src/orchestrator.ts` calls `fencingHandle.validate` only once before cycle execution.
- `fencingTtlMs` defaults to 60 seconds in `packages/shared/src/config/runtime-config.ts`, while role and quality stages can run significantly longer.
- `NoopLockAuthority` is available and the default run lock provider is `noop`.

## Why This Is a Problem
Distributed execution safety depends on one coherent ownership model. Separate lock and fencing paths can diverge, and a fixed TTL without renewal means a worker can continue after its fencing lease expires. Another worker could later acquire a new fence and both could write or perform side effects.

## Risk
- Duplicate execution can occur during long-running tasks.
- Expired fences can allow stale workers to persist state or artifacts.
- Operators may believe distributed locking is enabled while one part of the system is still in-memory or noop.
- Multi-worker deployments can become unsafe under pauses, slow tools, or network delays.

## Recommended Direction
Consolidate locking and fencing into a single lease authority with heartbeat, renewal, validation before every critical side effect, and explicit configuration guards for multi-worker deployments.

## Suggested Refactoring Steps
1. Define one `ExecutionLeaseAuthority` port covering acquire, renew, validate, and release.
2. Remove duplicate provider implementations or make one delegate to the other.
3. Renew leases during role execution and quality gates.
4. Validate fencing tokens before state writes and non-idempotent side effects.
5. Reject `workerCount > 1` when the lock provider is `noop` or local-only.

## Acceptance Criteria for Resolution
- A single lease abstraction owns run lock and fencing behavior.
- Long-running cycles renew their lease before expiration.
- State writes fail if the current fence is stale.
- Multi-worker unsafe configuration fails startup.
- Tests cover lease expiry, renewal, stale worker writes, and lock contention.
