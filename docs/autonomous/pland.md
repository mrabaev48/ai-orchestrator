# План и техническая спецификация: путь к полностью автономному AI-разработчику

## 0. Контекст и целевое состояние

### Текущее состояние (as-is)
Проект уже реализует сильное orchestration-ядро:
- modular monorepo (`core/application/execution/workflow/state/agents/tools`);
- durable state (in-memory + PostgreSQL);
- control plane CLI + worker + dashboard API;
- retries/timeouts/cancellation базового уровня;
- approval gates, read-model, telemetry, часть git lifecycle.

Ограничения до «полностью автономного AI-разработчика»:
- недостаточно замкнутый think/act/observe цикл с доказательным execution evidence на каждом шаге;
- не полностью формализованы policy/risk gates для безопасной автомутации кода;
- недостаточная глубина enterprise-ready наблюдаемости и recovery orchestration;
- неполная эксплуатационная зрелость multi-tenant/governance/security hardening.

### Целевое состояние (to-be)
Система должна автономно и безопасно выполнять инженерный цикл end-to-end:
1. принимать цель/эпик;
2. декомпозировать в backlog graph;
3. выполнять задачи через bounded tool loop;
4. создавать и проверять изменения (build/lint/typecheck/test/security);
5. формировать branch/commit/push/draft PR с evidence bundle;
6. корректно обрабатывать ошибки (retry/resume/replay/escalate);
7. обеспечивать полную аудируемость и управляемость через policy + observability.

---

## 1. Пошаговый план реализации

## Phase A — Safety Foundation (P0)

### A1. Formal execution policy engine hardening
**Цель:** единый policy-core для всех критичных решений выполнения.

**Задачи:**
- Ввести policy decision matrix:
  - allow/deny/requires_approval/defer;
  - классификация риска действий (filesystem write, git mutation, dependency change, migration, secret-touch).
- Поддержать детерминированные policy checks до/после шага.
- Нормализовать policy violation error contract.

**Артефакты:**
- `packages/core`: policy decision types + events.
- `packages/execution`: preflight/postflight policy enforcement.
- `packages/application`: approval workflows.

### A2. State-machine invariants and idempotency guards
**Цель:** исключить нелегальные переходы и дубли side-effects под retry/replay.

**Задачи:**
- Явный transition table для task/milestone/run states.
- Idempotency keys для внешних эффектов (tool exec, git actions, PR actions).
- Write-once semantics для run-step evidence.

### A3. Secure mutation perimeter
**Цель:** безопасный контур репозитория.

**Задачи:**
- deny-by-default write policy;
- path allowlist + protected path denylist;
- shell allowlist + command templates;
- mandatory dry-run для patch apply и destructive ops.

---

## Phase B — Autonomous Execution Core (P1)

### B1. Tool action loop v2 (think/act/observe)
**Цель:** полноценный многошаговый агентный цикл.

**Задачи:**
- Внедрить step protocol:
  - `plan_step` -> `tool_call` -> `observation` -> `decision`.
- Ограничить loop лимитами:
  - maxRoleStepsPerTask;
  - maxToolCallsPerStep;
  - per-call timeout.
- Стандартизировать tool contracts:
  - строгая валидация входа;
  - нормализация выхода;
  - типизированные ошибки.

### B2. Repository mutation pipeline v2
**Цель:** автономная и воспроизводимая модификация кода.

**Задачи:**
- Ввести pipeline стадии:
  1. workspace prepare;
  2. branch create/switch;
  3. patch/apply;
  4. validation suite;
  5. commit;
  6. push;
  7. PR draft.
- Встроить rollback hooks и compensation steps.
- Добавить policy-gated checkpoints для risky actions.

### B3. Execution evidence model
**Цель:** полный audit trail и дебаг-пригодность.

**Задачи:**
- Unified evidence schema:
  - tool command, args, cwd;
  - stdout/stderr summary;
  - file diffs;
  - validation reports;
  - policy decisions;
  - approvals history.
- Correlation IDs:
  - runId, taskId, stepId, attemptId, toolCallId.

---

## Phase C — Reliability and Recovery (P2)

### C1. Scheduler/worker decoupling
**Цель:** устойчивое асинхронное выполнение.

**Задачи:**
- Очередь задач + lease/heartbeat модель;
- visibility timeout;
- poison/dead-letter routing.

### C2. Recovery orchestration
**Цель:** безопасные resume/replay без нарушения инвариантов.

**Задачи:**
- checkpointed run graph;
- deterministic replay boundaries;
- selective step replay;
- recovery policy matrix (auto/manual).

### C3. Advanced observability
**Цель:** операционная управляемость уровня production.

**Задачи:**
- Метрики SLI/SLO:
  - success rate, recovery rate, mean cycle latency, retry inflation, policy blocks.
- Tracing spans:
  - role invocation, tool call, state commit, git stage.
- Audit queries в dashboard API.

---

## Phase D — Autonomous Governance & Scale (P3)

### D1. Multi-tenant isolation
**Цель:** безопасная эксплуатация для нескольких org/project.

**Задачи:**
- tenant-scoped state/read models/locks/workspaces;
- tenant-aware authZ;
- quota/cost isolation.

### D2. Governance bundles
**Цель:** формализованный compliance-периметр.

**Задачи:**
- policy profiles (strict/balanced/aggressive);
- immutable audit export;
- reviewer attestations.

### D3. Release autonomy policy
**Цель:** безопасно довести автономию до merge-ready уровня.

**Задачи:**
- staged autonomy levels (L0-L5);
- auto-merge только при прохождении quality/security gates;
- explicit human override protocol.

---

## 2. Подробная техническая спецификация

## 2.1 Архитектурные требования

### Domain layer (`packages/core`)
1. Добавить типы:
   - `ExecutionPolicyDecision`;
   - `RunStepEvidence`;
   - `IdempotencyKey`;
   - `RecoveryCheckpoint`;
   - `AutonomyLevel`.
2. Добавить инварианты:
   - не более одного `in_progress` milestone;
   - task transition только через разрешенные дуги;
   - side-effect stage обязан иметь evidence.

### Application layer (`packages/application`)
1. Новые use-cases:
   - `evaluatePolicyForAction`;
   - `approveOrRejectRiskAction`;
   - `buildReviewBundle`;
   - `resumeFromCheckpoint`.
2. Read-model projections:
   - `run_step_evidence_view`;
   - `policy_decision_view`;
   - `autonomy_readiness_view`.

### Execution layer (`packages/execution`)
1. Ввести `AgentActionLoopEngine`:
   - deterministic step runner;
   - bounded retry loop;
   - cancellation-aware tool executor.
2. Ввести `RepoMutationPipeline`:
   - composable stages с transactional semantics на уровне state.
3. Ввести `RecoveryCoordinator`.

### Tools layer (`packages/tools`)
1. Контракт каждого адаптера:
   - schema input;
   - schema output;
   - typed error envelope;
   - policy metadata (`riskClass`, `requiresApproval`, `isDeterministic`).
2. Sandbox contract:
   - cwd constraints;
   - path guard;
   - process timeout + kill semantics.

### Infrastructure layer (`packages/state`, `apps/*`)
1. Persisted event model:
   - `run_step_started/completed/failed`;
   - `policy_checked`;
   - `approval_requested/resolved`;
   - `mutation_stage_completed`.
2. Dashboard API:
   - evidence queries;
   - policy audit filters;
   - replay control endpoints.

---

## 2.2 Контракты данных (минимальный draft)

### `RunStepEvidence`
```ts
interface RunStepEvidence {
  runId: string;
  taskId: string;
  stepId: string;
  attempt: number;
  role: string;
  startedAt: string;
  finishedAt?: string;
  status: 'started' | 'succeeded' | 'failed' | 'cancelled';
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output?: unknown;
    error?: { code: string; message: string; retriable: boolean };
    durationMs: number;
  }>;
  validation?: {
    build?: { status: 'pass' | 'fail'; summary: string };
    lint?: { status: 'pass' | 'fail'; summary: string };
    typecheck?: { status: 'pass' | 'fail'; summary: string };
    test?: { status: 'pass' | 'fail'; summary: string };
  };
  policy: {
    decisions: Array<{
      action: string;
      decision: 'allow' | 'deny' | 'requires_approval' | 'defer';
      reason: string;
    }>;
  };
}
```

### `ExecutionPolicyDecision`
```ts
interface ExecutionPolicyDecision {
  action: string;
  riskClass: 'low' | 'medium' | 'high' | 'critical';
  decision: 'allow' | 'deny' | 'requires_approval' | 'defer';
  reason: string;
  evaluatedAt: string;
  evaluator: 'policy-engine';
}
```

---

## 2.3 Оркестрационный протокол выполнения

### Этапы run-task
1. `Preflight`
   - загрузка runtime policy;
   - lock acquisition;
   - executable task check.
2. `Action Loop`
   - агент генерирует следующий шаг;
   - policy pre-check;
   - tool execute;
   - observation normalize;
   - state/evidence append.
3. `Mutation Pipeline`
   - git branch;
   - patch apply;
   - validation suite;
   - commit/push/pr draft.
4. `Postflight`
   - review gate;
   - release readiness gate;
   - state transition commit.

### Retry semantics
- Retry only when `retriable=true` и policy разрешает.
- Backoff: экспоненциальный с jitter.
- Перезапуск с последнего checkpoint, а не с нуля.

### Cancellation semantics
- `AbortSignal` прокидывается во все tool adapters.
- При cancel:
  - помечать step как `cancelled`;
  - завершать дочерние процессы;
  - сохранять компенсирующий checkpoint.

---

## 2.4 Security и safety спецификация

1. **AuthN/AuthZ**
   - mandatory API key/JWT;
   - role-based permissions для approval/replay/mutation endpoints.
2. **Secret hygiene**
   - redaction в логах, prompts, evidence.
3. **Write protection**
   - запрещать запись вне workspace allowlist.
4. **Risky actions**
   - dependency upgrade, migration, delete file/tree -> только с approval.
5. **Supply-chain gates**
   - dependency diff policy;
   - lockfile integrity checks.

---

## 2.5 Observability спецификация

### Метрики
- `orchestrator_run_total{status}`
- `orchestrator_step_duration_ms{role,tool}`
- `orchestrator_retry_total{reason}`
- `orchestrator_policy_denied_total{action}`
- `orchestrator_approval_wait_ms`

### Трейсы
- `run_cycle`
- `task_execution`
- `tool_call`
- `state_commit`
- `git_mutation_stage`

### Логи
- structured JSON;
- correlation keys mandatory;
- error chain с typed cause.

---

## 2.6 План тестирования

### Unit
- policy engine decisions;
- state transition guards;
- idempotency key resolver;
- tool output normalization.

### Integration
- run-task forced path;
- tool loop with retries/timeouts/cancel;
- mutation pipeline dry-run/commit modes;
- approval gate lifecycle.

### E2E
- happy path: epic -> task done -> PR draft;
- failure path: tool fail -> retry -> escalate;
- recovery path: dead-letter -> resume/replay;
- security path: denied unsafe write.

### Regression matrix
- multi-worker contention;
- duplicate event prevention;
- replay determinism;
- protected path enforcement.

---

## 2.7 Дорожная карта поставки (итерации)

### Iteration 1 (2–3 недели)
- A1, A2, A3 + базовые тесты.

### Iteration 2 (2–4 недели)
- B1 + unified evidence schema + tool contract normalization.

### Iteration 3 (2–4 недели)
- B2 + quality gates + PR draft automation.

### Iteration 4 (2–3 недели)
- C1, C2 + recovery coordinator.

### Iteration 5 (2–4 недели)
- C3 + dashboard audit extensions.

### Iteration 6 (3–5 недель)
- D1, D2, D3 + autonomy level rollout.

---

## 2.8 Критерии готовности «полностью автономный AI-разработчик»

Система считается достигшей цели, если одновременно выполняется:
1. ≥95% задач класса low/medium завершаются без human intervention;
2. 100% high/critical risk actions проходят policy+approval flow;
3. 100% run steps имеют complete evidence trail;
4. replay/resume не нарушают state invariants (0 critical integrity regressions);
5. все quality gates (build/lint/typecheck/test/security) обязательны перед PR draft;
6. observability покрывает root-cause анализ без ручного форензика логов на хосте.

---

## 2.9 Риски и меры снижения

1. **Слишком агрессивная автономия**
   - Мера: autonomy levels + deny-by-default policy.
2. **Нестабильность под concurrency**
   - Мера: shared lock + lease heartbeat + idempotency keys.
3. **Скрытые side effects tool execution**
   - Мера: sandbox + deterministic adapters + exhaustive evidence.
4. **Операционный перегруз telemetry**
   - Мера: sampling policy + tiered retention.

---

## 2.10 Минимальный стартовый backlog (первые 10 задач)

1. Ввести `ExecutionPolicyDecision` и policy event schema.
2. Реализовать preflight/postflight policy checks в orchestrator.
3. Добавить idempotency keys для git/tool actions.
4. Ввести `RunStepEvidence` persistent model.
5. Реализовать cancellation-safe tool executor.
6. Реализовать bounded `AgentActionLoopEngine`.
7. Добавить mutation stage machine (branch->apply->validate->commit->push->pr).
8. Интегрировать mandatory validation suite gates.
9. Расширить dashboard API evidence/policy endpoints.
10. Добавить e2e smoke для autonomous task completion + safe escalation.
