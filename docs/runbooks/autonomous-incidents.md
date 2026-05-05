# Autonomous incidents runbook

## 1. Success rate breach
- Trigger: SLO `success-rate` criterion failed.
- Severity: critical.
- Immediate actions:
  1. Freeze autonomous side effects (enable kill-switch / manual approvals only).
  2. Inspect top failed tasks by `taskId`, `role`, `toolName` in trace/audit endpoints.
  3. Route unresolved incidents to release owner and incident commander.
- Diagnostics:
  - Check latest policy outcome and reason codes.
  - Check dead-letter growth and replay saturation.
- Exit criteria:
  - Success rate restored above threshold for two consecutive evaluation windows.

## 2. Timeout rate breach
- Trigger: `timeout-rate` criterion failed.
- Severity: critical.
- Immediate actions:
  1. Identify stages with highest timeout counts.
  2. Validate external dependency latency (VCS/network/tools).
  3. Reduce concurrency and tighten step budgets if cascading failures occur.
- Diagnostics:
  - Review timeout boundaries for retry loop and mutation stages.
  - Verify no hidden work remains after timeout.
- Exit criteria:
  - Timeout rate returns within policy threshold and no stale running steps remain.

## 3. Cancellation rate breach
- Trigger: `cancellation-rate` criterion failed.
- Severity: critical.
- Immediate actions:
  1. Verify cancellation source (operator, lease loss, policy deny, runtime shutdown).
  2. Ensure `AbortSignal` propagation works across execution and tool boundaries.
  3. Check for partial transitions and compensation outcomes.
- Diagnostics:
  - Inspect cancellation reason and run-step evidence chain.
  - Verify lease heartbeat stability for worker ownership.
- Exit criteria:
  - Cancellation rate normalized and no inconsistent run states detected.

## 4. Latency breach
- Trigger: `p95-latency` criterion failed.
- Severity: critical.
- Immediate actions:
  1. Identify high-latency roles/tools and queue pressure.
  2. Evaluate recent config or model/provider changes.
  3. Apply bounded mitigation (throttle, selective disablement, fallback path).
- Diagnostics:
  - Compare p95 latency trend against deployment timeline.
  - Validate retry count inflation and backoff policy behavior.
- Exit criteria:
  - P95 latency below threshold for two windows and backlog drain trend is positive.

## 5. Error budget burn warning
- Trigger: error budget status `burn_warning`.
- Severity: warning.
- Immediate actions:
  1. Start proactive incident channel and assign owner.
  2. Review leading indicator breaches and tenant impact.
  3. Prepare controlled rollback / safety mode plan.
- Exit criteria:
  - Burn rate stabilized below warning threshold.

## 6. Error budget exhausted
- Trigger: error budget status `exhausted`.
- Severity: critical.
- Immediate actions:
  1. Enter safe mode: stop non-essential autonomous mutations.
  2. Escalate to incident commander and on-call owners.
  3. Require manual approval for high-risk actions until recovery verified.
- Exit criteria:
  - Approved recovery plan executed and sustained healthy SLO verdict confirmed.
