# Production-Ready Plan: Fully Autonomous AI Developer

## 1. Цель

Перевести текущий AI Orchestrator из состояния «сильное orchestration-ядро» в
**production-ready платформу автономной разработки**, которая:
- безопасно выполняет end-to-end инженерный цикл;
- детерминированно управляет retries/timeouts/cancellation;
- обеспечивает auditability и forensic-grade observability;
- масштабируется для multi-tenant эксплуатации;
- имеет управляемую модель автономии (policy-first, human override).

> Подробная техническая спецификация вынесена в `docs/autonomous/spec.md`.

---

## 2. Definition of Done (production-ready)

Система считается production-ready только при одновременном выполнении:

1. **Safety/Policy**
   - 100% mutation actions проходят policy evaluation;
   - high/critical actions требуют approval или explicit exception policy.
2. **Reliability**
   - корректная работа при retry/replay/cancellation без нарушения state invariants;
   - idempotency для всех внешних side-effects.
3. **Quality Gates**
   - build/lint/typecheck/test/security gates обязательны перед PR draft/merge stage.
4. **Observability**
   - полный evidence trail на каждый run step;
   - root-cause анализ инцидента возможен без доступа к хосту.
5. **Security & Governance**
   - tenant isolation, RBAC/ABAC, secret redaction, immutable audit log.
6. **Operations**
   - SLO + alerting + runbooks + disaster recovery drill.

---

## 3. Дорожная карта (phased)

## Phase 0 — Baseline & Readiness Gate (1–2 недели)

**Цель:** зафиксировать исходное состояние и ввести «stop/go» критерии.

### Deliverables
- Baseline audit текущих инвариантов выполнения, tool contracts, security posture.
- Целевая матрица SLO/SLI и readiness scorecard.
- План миграции схемы состояния и событий.

### Exit criteria
- Утверждённый `production-readiness scorecard`.
- Зафиксированные block/non-block risks с owner+deadline.

---

## Phase 1 — Safety Core (2–4 недели)

**Цель:** построить non-bypass safety perimeter.

### Deliverables
- Execution Policy Engine (allow/deny/requires_approval/defer).
- Risk taxonomy + action classification.
- Non-bypass preflight/postflight policy checks.
- Deterministic state transition guards.
- Idempotency keys и deduplication для external effects.
- Mandatory write scope enforcement + protected paths.

### Exit criteria
- Невозможно выполнить risky mutation в обход policy.
- Невозможно совершить illegal transition без явной ошибки.

---

## Phase 2 — Autonomous Action Loop (3–5 недель)

**Цель:** production-grade think/act/observe loop.

### Deliverables
- `AgentActionLoopEngine` с bounded steps, timeout budget и cancellation propagation.
- Typed tool contracts + strict input/output validation.
- Normalized tool error model (retriable/non-retriable/compensatable).
- Step-level evidence persistence и correlation IDs.
- Контроль детерминизма и недопущение скрытых side-effects.

### Exit criteria
- Каждый tool call трассируется и воспроизводим по evidence.
- Retry semantics единообразны и диагностируемы.

---

## Phase 3 — Repository Mutation Pipeline (3–5 недель)

**Цель:** безопасная и воспроизводимая автомутация репозитория.

### Deliverables
- `RepoMutationPipeline` stages:
  1. workspace prepare;
  2. branch lifecycle;
  3. patch/apply;
  4. verification suite;
  5. commit/push;
  6. PR draft + evidence bundle.
- Compensation/rollback strategy на уровне pipeline stages.
- Approval gates для sensitive stages.

### Exit criteria
- Автономное формирование branch+commit+draft PR с проверками.
- Отказ на любой стадии не приводит к silently corrupted state.

---

## Phase 4 — Reliability, Recovery, Queueing (3–4 недели)

**Цель:** устойчивость под длительной/масштабной нагрузкой.

### Deliverables
- Scheduler/worker separation с lease/heartbeat/visibility timeout.
- Poison queue + dead-letter + controlled replay.
- Checkpoint graph + deterministic resume.
- Concurrency safety (distributed locks + fencing tokens).

### Exit criteria
- Нет duplicate execution under contention.
- Recovery сценарии проходят e2e без инцидентов целостности.

---

## Phase 5 — Security, Multi-Tenancy, Governance (3–5 недель)

**Цель:** enterprise-grade эксплуатационная безопасность.

### Deliverables
- Tenant isolation across state, locks, workspaces, read-models.
- RBAC/ABAC for API/control-plane actions.
- Immutable audit export + compliance profiles.
- Secret management hardening и zero-trust service boundaries.

### Exit criteria
- Pentest/SAST/DAST critical findings = 0 open.
- Tenant breakout risk mitigated and validated.

---

## Phase 6 — Observability, SLO, Ops Excellence (2–4 недели)

**Цель:** production operations readiness.

### Deliverables
- End-to-end traces (run/task/step/tool/mutation).
- SLI/SLO dashboards + alert rules + on-call runbooks.
- Error budget governance.
- Capacity/load/chaos tests и отчёт по resiliency.

### Exit criteria
- Операторы могут локализовать инцидент < 15 минут.
- SLO мониторятся и управляются по error budget.

---

## Phase 7 — Controlled Autonomy Rollout (2–3 недели)

**Цель:** управляемый выпуск autonomy уровней L0→L5.

### Deliverables
- Gradual rollout policy по классам задач/репозиториям.
- Human override/kill-switch protocol.
- Release gates для автоперехода между autonomy levels.

### Exit criteria
- Достигнуты KPI автономии без деградации безопасности/качества.
- Rollback между уровнями автономии выполняется безопасно.

---

## 4. Critical Path (обязательная последовательность)

1. Safety Core (Phase 1)
2. Action Loop (Phase 2)
3. Mutation Pipeline (Phase 3)
4. Recovery/Queueing (Phase 4)
5. Security/Multi-tenancy (Phase 5)
6. Observability/SLO (Phase 6)
7. Controlled rollout (Phase 7)

Нарушать эту последовательность нельзя: более поздние фазы зависят от safety и determinism фундамента.

---

## 5. KPI и readiness metrics

- Autonomous task completion rate (low/medium risk): target ≥ 95%.
- Policy violation prevention rate: 100% blocked or approval-routed.
- Duplicate side-effect incidents: 0.
- Mean time to detect (MTTD): < 5 мин.
- Mean time to recover (MTTR): < 30 мин.
- Evidence completeness: 100% run steps.
- Security critical vulns: 0 open.

---

## 6. Minimal production backlog (первые 12 задач)

1. Ввести единый `ExecutionPolicyDecision` контракт.
2. Добавить non-bypass policy checks в orchestrator pre/postflight.
3. Реализовать idempotency/dedup для tool+git side-effects.
4. Формализовать transition table и validation guards.
5. Реализовать `AgentActionLoopEngine` с bounded budgets.
6. Ввести typed tool adapters + strict schema validation.
7. Добавить persisted `RunStepEvidence` + correlation IDs.
8. Реализовать `RepoMutationPipeline` stages и compensation.
9. Интегрировать mandatory verification suite gates.
10. Ввести queue lease/heartbeat + dead-letter/replay.
11. Расширить Dashboard API (evidence/policy/recovery/audit).
12. Добавить e2e + chaos + load suite для production readiness.

---

## 7. Зависимости и артефакты

- Техспека: `docs/autonomous/spec.md`
- Дизайн-решения: ADR на каждый критичный архитектурный выбор.
- Runbooks: инциденты, rollback, recovery.
- Security pack: threat model, controls matrix, pentest report.
