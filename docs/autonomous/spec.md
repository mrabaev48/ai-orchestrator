# Production-Ready Technical Specification: Autonomous AI Developer

## 1. Scope and goals

Документ определяет production-ready реализацию автономного AI-разработчика поверх текущего AI Orchestrator.

### In scope
- автономный execution loop (think/act/observe);
- безопасная мутация репозитория;
- policy/approval/governance;
- надежность (retry/replay/cancellation/recovery);
- multi-tenant security;
- observability/SLO/operations.

### Out of scope
- прямой auto-merge в default branch без прохождения policy+quality gates;
- self-modifying policy engine без отдельного governance workflow.

---

## 2. Architecture blueprint

## 2.1 Logical layers

1. **Domain (`packages/core`)**
   - entities, invariants, policy decisions, evidence records, state transitions.
2. **Application (`packages/application`)**
   - orchestrated use-cases, approval lifecycles, review bundle assembly, recovery control.
3. **Execution (`packages/execution`)**
   - deterministic step engine, mutation pipeline, recovery coordinator, worker protocol.
4. **Tools (`packages/tools`)**
   - typed adapters + normalized errors + sandbox execution contracts.
5. **Infrastructure (`packages/state`, `apps/*`)**
   - persistence/event log/read models/API/auth/queue/locks/telemetry sink.

## 2.2 Core runtime components

- `AgentActionLoopEngine`
- `ExecutionPolicyEngine`
- `RepoMutationPipeline`
- `RecoveryCoordinator`
- `EvidenceStore`
- `AutonomyLevelController`

---

## 3. Domain model and invariants

## 3.1 New domain contracts

### `ExecutionPolicyDecision`
```ts
interface ExecutionPolicyDecision {
  decisionId: string;
  action: string;
  subject: {
    tenantId: string;
    projectId: string;
    runId: string;
    taskId?: string;
    stepId?: string;
  };
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  decision: 'allow' | 'deny' | 'requires_approval' | 'defer';
  reasons: string[];
  controls: string[];
  evaluatedAt: string;
  policyVersion: string;
}
```

### `RunStepEvidence`
```ts
interface RunStepEvidence {
  evidenceId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  role: string;
  startedAt: string;
  finishedAt?: string;
  status: 'started' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out';
  promptFingerprint: string;
  toolCalls: ToolCallEvidence[];
  mutationStages: MutationStageEvidence[];
  validations: ValidationEvidence[];
  policyDecisions: string[]; // decisionIds
  approvals: string[]; // approvalIds
  resourceUsage: {
    tokensIn?: number;
    tokensOut?: number;
    cpuMs?: number;
    memoryMbPeak?: number;
    wallTimeMs: number;
  };
  checksum: string; // integrity hash
}
```

### `RecoveryCheckpoint`
```ts
interface RecoveryCheckpoint {
  checkpointId: string;
  runId: string;
  taskId: string;
  stepId: string;
  stage: 'preflight' | 'action_loop' | 'mutation_pipeline' | 'postflight';
  stateVersion: number;
  createdAt: string;
  replayFrom: 'stage_start' | 'last_tool_call' | 'last_validation';
}
```

## 3.2 Hard invariants

1. Single active milestone (`in_progress`) per project scope.
2. Transition table is closed and explicit; illegal transitions hard-fail.
3. Любой side-effectful action должен иметь policy decision + evidence.
4. Любой repeatable external effect должен иметь idempotency key.
5. Evidence append-only, immutable, checksum-verified.
6. Replay/resume не меняют исторические факты, только добавляют новые события.

---

## 4. Execution protocol

## 4.1 Run lifecycle

1. **Preflight**
   - load policy profile;
   - acquire distributed lock + fencing token;
   - validate task executability;
   - initialize run budget.

2. **Action loop**
   - role produces next structured action;
   - policy evaluates action;
   - optional approval branch;
   - tool execution in sandbox;
   - normalize observation;
   - append evidence + emit events;
   - evaluate continuation/stop conditions.

3. **Mutation pipeline**
   - workspace prepare;
   - branch setup;
   - patch/apply;
   - verification suite;
   - commit/push;
   - draft PR + review bundle.

4. **Postflight**
   - review/test/release readiness gates;
   - finalize state transitions;
   - publish read-model updates.

## 4.2 Step protocol

```ts
type ActionStep = {
  stepId: string;
  intent: 'inspect' | 'edit' | 'validate' | 'summarize' | 'escalate';
  toolRequest?: {
    toolName: string;
    input: unknown;
    timeoutMs: number;
  };
  expectedOutcome: string;
  stopCondition?: string;
};
```

## 4.3 Retry/timeout/cancellation semantics

- Retry разрешён только для retriable ошибок и только в рамках budget.
- Exponential backoff + jitter + max-attempt cap.
- Timeout enforced per tool call and per run-stage.
- Cancellation propagates via `AbortSignal` to every adapter/process.
- Timeout/cancel обязательно создают explicit evidence + compensating checkpoint.

## 4.4 Idempotency and dedup

- Key format: `{tenant}:{project}:{run}:{task}:{stage}:{attempt}:{actionHash}`.
- Dedup store must be strongly consistent in worker scope.
- Non-idempotent operations (push/PR create) guarded by idempotency registry.

---

## 5. Policy and approval model

## 5.1 Risk classification

- `low`: read-only ops, non-destructive checks.
- `medium`: controlled edits in allowed paths.
- `high`: dependency changes, schema migrations, cross-module refactors.
- `critical`: destructive ops, security-sensitive changes, production config changes.

## 5.2 Policy decisions

- `allow`: execute immediately.
- `deny`: hard stop + escalation.
- `requires_approval`: enqueue approval request.
- `defer`: postpone with reason and follow-up action.

## 5.3 Approval workflow

1. Create immutable approval request with context and risk rationale.
2. Route to authorized approvers by tenant/project policy.
3. SLA timers + reminder/escalation.
4. Approval result persisted and linked to evidence.
5. Denied approvals trigger safe rollback path.

---

## 6. Repository mutation pipeline

## 6.1 Stages

1. `workspace_prepare`
2. `branch_prepare`
3. `change_apply`
4. `verification`
5. `commit_prepare`
6. `push_prepare`
7. `pr_draft_prepare`
8. `finalize`

## 6.2 Verification gates (mandatory)

- Build
- Lint
- Typecheck
- Unit/integration tests
- Security checks (SAST/dependency audit/secret scan)
- Optional domain-specific gates (migration safety, contract tests)

## 6.3 Rollback/compensation

- `change_apply` fail -> restore workspace snapshot.
- `verification` fail -> no commit/push, generate remediation task.
- `push_prepare` fail -> retry with capped attempts, otherwise escalate.
- `pr_draft_prepare` fail -> retain branch and evidence, mark partial success.

---

## 7. Tools and sandbox contracts

## 7.1 Tool adapter contract

Каждый tool adapter обязан иметь:
- strict input schema;
- strict output schema;
- normalized error envelope;
- determinism metadata;
- risk metadata.

```ts
interface ToolResult<TOutput> {
  ok: boolean;
  output?: TOutput;
  error?: {
    code: string;
    message: string;
    retriable: boolean;
    category: 'validation' | 'timeout' | 'io' | 'policy' | 'internal';
  };
  telemetry: {
    durationMs: number;
    attempts: number;
    timedOut: boolean;
  };
}
```

## 7.2 Sandbox requirements

- Execution only inside tenant/project workspace.
- Path traversal prevention.
- Process-level CPU/memory/time limits.
- Network policy by default deny; explicit egress allowlist when needed.
- Full command provenance logging.

---

## 8. Persistence and eventing

## 8.1 Event taxonomy

- `run.started|completed|failed|cancelled`
- `task.selected|blocked|completed`
- `step.started|completed|failed|timed_out|cancelled`
- `tool.called|succeeded|failed`
- `policy.evaluated|denied|approval_required`
- `approval.requested|approved|rejected|expired`
- `mutation.stage.completed|failed|compensated`
- `recovery.checkpoint.created|replay.started|resume.completed`

## 8.2 Storage model

- Append-only event log + materialized read models.
- Snapshotting for performant recovery.
- Partitioning by tenant/project/time.
- Retention policy: hot/warm/cold tiers.
- Integrity: event signatures/checksums.

---

## 9. API and control-plane extensions

## 9.1 Dashboard API (read + controlled write)

- Evidence queries by run/task/step/tool.
- Policy decision audit endpoints.
- Approval queue/decision endpoints.
- Recovery control endpoints (resume/replay with policy checks).
- SLO/health/incident views.

## 9.2 CLI extensions

- `run-task --task-id ... --autonomy-level ...`
- `approve-action --approval-id ...`
- `replay-step --run-id ... --step-id ...`
- `export-evidence --run-id ... --format ...`

---

## 10. Multi-tenancy and security

## 10.1 Tenant isolation

- tenantId mandatory in all state keys/events/read-model records.
- Lock scopes include tenant+project.
- Workspace path segregation by tenant/project.

## 10.2 AuthN/AuthZ

- API key/JWT/OIDC support.
- RBAC + ABAC policies (action, resource, context).
- Just-in-time elevated approvals for critical actions.

## 10.3 Security controls

- Secret redaction in logs/prompts/evidence.
- Encryption at rest and in transit.
- KMS-backed key rotation.
- Continuous vuln scanning + dependency policy.

---

## 11. Observability and operations

## 11.1 Metrics

- run success/failure/cancel rates
- step latency histograms
- retry inflation ratio
- policy deny/approval-required rates
- evidence completeness rate
- queue lag and lease expiry rate

## 11.2 Tracing

Required spans:
- run lifecycle
- task execution
- tool call
- policy evaluation
- mutation stage
- state commit
- recovery operations

## 11.3 Logging

- Structured JSON logs.
- Mandatory correlation fields: tenantId/projectId/runId/taskId/stepId.
- Error chain with causal context.

## 11.4 SLO and incident response

- Define SLOs per tenant tier.
- Alerting on error budget burn and policy-denied spikes.
- On-call runbooks and postmortem templates.

---

## 12. Testing and verification strategy

## 12.1 Unit tests

- policy matrix evaluation
- transition guard coverage
- idempotency key + dedup logic
- tool result normalization

## 12.2 Integration tests

- action loop retries/timeouts/cancellation
- approval workflow lifecycle
- mutation stages with compensation
- queue lease and fencing behavior

## 12.3 E2E tests

- full autonomous happy path to PR draft
- risky action approval path
- failure -> dead-letter -> resume/replay path
- multi-worker contention with no duplicate side effects

## 12.4 Non-functional tests

- load/perf tests
- chaos/fault injection
- security tests (authZ bypass, path escape, secret leakage)
- disaster recovery drills

---

## 13. Migration and rollout plan

1. Introduce new schemas behind feature flags.
2. Dual-write (old/new evidence/event projections).
3. Validate parity dashboards.
4. Cutover by tenant cohorts.
5. Decommission legacy paths after stability window.

---

## 14. Risks and mitigations

1. **Policy bypass risk**
   - Mitigation: centralized non-bypass policy checks + invariant tests.
2. **Concurrency duplicates**
   - Mitigation: lock fencing + idempotency registry + dedup store.
3. **Unbounded autonomy drift**
   - Mitigation: autonomy levels + mandatory approval thresholds.
4. **Operational overload**
   - Mitigation: telemetry sampling + retention tiers + SLO governance.

---

## 15. Acceptance criteria (production sign-off)

- 100% critical/high-risk actions are blocked or approved, never implicit.
- 100% side-effect actions have immutable evidence with checksums.
- 0 unresolved critical security findings.
- No integrity regressions in replay/resume under chaos tests.
- SLO dashboard and alerting live for all production tenants.
- Successful progressive rollout across autonomy levels with rollback proof.
