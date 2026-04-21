# AI Orchestrator — Full Implementation Plan to Reach Premium / Production Level

**Author:** Senior TypeScript Architect  
**Date:** 2026-04-19  
**Artifact type:** Implementation roadmap / product + architecture plan  
**Scope:** Based on direct inspection of the uploaded codebase (`apps/*`, `packages/*`, `tests/*`, `README.md`)

---

## 1. Executive summary

The current project is already a **solid orchestration kernel**:

- durable project state
- workflow engine with retry / split / escalation
- role-based agent model
- CLI + REST API + SSE execution stream
- export layer
- basic test coverage
- LLM provider abstraction

But today it is still **closer to an AI workflow coordinator than to a production-grade autonomous engineering platform**.

### The largest gaps are:

1. **No real tool-execution loop**
   - tools exist in `packages/tools/src/index.ts`
   - but agents are not tool-using actors
   - orchestrator never runs a think → act → observe loop

2. **No repository mutation pipeline**
   - no patch/diff generation contract
   - no patch application engine
   - no branch / commit / PR lifecycle
   - no build/test execution inside the actual runtime

3. **Partial contract enforcement**
   - only some role outputs are schema-validated in `packages/llm/src/output-schemas.ts`
   - other outputs pass through unchecked

4. **State and task graph semantics are not yet robust enough**
   - task splitting currently creates a dependency deadlock
   - `runTask(taskId)` does not actually guarantee running that task

5. **Production hardening is incomplete**
   - no auth / RBAC on dashboard API
   - permissive CORS
   - limited observability
   - no tenant model
   - no queue/worker separation
   - no operational safety rails for repo writes

---

## 2. What the project already does well

This matters because the plan should build on strengths, not rewrite them.

### Strong foundations already present

#### 2.1 Durable state model
Relevant files:
- `packages/core/src/types.ts`
- `packages/state/src/typeorm.store.ts`
- `packages/state/src/entities/*`
- `packages/state/src/repositories/*`

Strengths:
- `ProjectState` is the real source of truth
- snapshots + append-only logs are a good fit for auditability
- TypeORM store uses transactions for snapshot updates
- domain events, runs, failures, decisions, artifacts are preserved

#### 2.2 Workflow policy layer
Relevant files:
- `packages/workflow/src/workflow-engine.ts`
- `packages/agents/src/roles/task-router.ts`

Strengths:
- task routing by kind
- dependency-aware task selection
- retry / split / escalation policy
- milestone-aware selection
- transition validation
- review/test guardrails

#### 2.3 Separation of concerns
Relevant files:
- `packages/application/src/runtime-factory.ts`
- `packages/execution/src/orchestrator.ts`
- `packages/agents/src/base-agent.ts`

Strengths:
- clean package boundaries
- orchestration isolated from adapters
- provider-agnostic LLM layer
- transport layer separated from business logic

#### 2.4 Operational surfaces
Relevant files:
- `apps/control-plane/src/index.ts`
- `apps/dashboard-api/src/modules/*`
- `apps/worker-cli/src/index.ts`
- `packages/execution/src/execution-event-bus.ts`

Strengths:
- CLI, API, debug CLI
- SSE event stream already exists
- good base for dashboard UX and remote control plane

---

## 3. Strategic target

The premium / production version should become:

> **A safe, observable, stateful AI engineering platform that can plan, execute, verify, export, and recover work on real repositories with auditable actions and strong operational controls.**

That means the platform must support:

- real repository reads and writes
- build / test / lint / typecheck execution
- patch application and validation loop
- Git branch / commit / PR lifecycle
- human approval gates for risky actions
- resumable jobs
- auth, RBAC, multitenancy
- metrics, traces, alerts
- stronger schemas and state evolution
- rich planning and delivery features

---

## 4. North-star architecture (target v2)

### Current flow
`state -> select task -> build prompt -> call role -> review -> test -> mark done`

### Target flow
`state -> select task -> plan execution -> tool actions -> collect evidence -> propose patch -> apply in sandbox -> run checks -> review -> test -> branch/commit/pr -> persist evidence -> finalize`

### New core concepts to add

#### 4.1 ToolExecutionContext
A per-run capability object injected into agents, including:

- filesystem tool
- git tool
- typescript tool
- shell/process tool
- test runner tool
- diff/patch tool
- search/index tool
- artifact/evidence store

#### 4.2 Action loop
Agents should no longer be single-shot JSON generators only.

They should support:
1. think
2. request tool action
3. receive observation
4. continue reasoning
5. stop with structured output

#### 4.3 Workspaces / sandboxes
Each run should operate in an isolated repo workspace:
- cloned branch or working tree
- temp workspace ID
- cleanup policy
- evidence capture

#### 4.4 Evidence model
Every meaningful execution step should persist:
- command
- outputs
- touched files
- diff summary
- test results
- diagnostics
- review findings
- approval events

#### 4.5 Human gate model
Risky transitions should require explicit approval:
- writes outside allowed modules
- dependency upgrades
- schema migrations
- deleting files
- release actions
- external integrations

---

## 5. Full implementation plan by workstream

# Workstream A — Core correctness fixes

These are the first fixes to land before adding major new capability.

## A1. Fix `runTask(taskId)` semantics
Relevant file:
- `packages/application/src/services/control-plane.service.ts`

### Current problem
`runTask(taskId)` validates the task and then calls `orchestrator.runCycle()`.  
This does **not guarantee** that the requested task will run.

### Implementation
Add one of these approaches:

#### Option A — forced task execution
- add `runCycle({ forcedTaskId?: string })`
- pass forced task through workflow selection
- validate task is executable
- run exactly that task or fail clearly

#### Option B — dedicated method
- add `orchestrator.runSingleTask(taskId)`
- bypass normal selector
- still use same guardrails and event recording

### Recommendation
Use **Option B**. Clearer API and fewer side effects.

### Acceptance criteria
- calling `runTask(taskId)` executes the exact task or returns deterministic error
- tests cover done / blocked / dependency-unsatisfied / success cases

---

## A2. Fix task splitting dependency deadlock
Relevant files:
- `packages/agents/src/roles/task-router.ts`
- `packages/execution/src/orchestrator.ts`

### Current problem
Subtasks are created with:
- `dependsOn: [parentTask.id]`
- parent becomes `blocked`

This can make subtasks permanently non-executable.

### Implementation
Introduce explicit task lineage fields:

```ts
parentTaskId?: string;
supersedesTaskId?: string;
splitGroupId?: string;
```

Change split semantics:
- parent becomes `superseded` or `split`
- subtasks inherit parent dependencies, not dependency on parent
- optional join/completion semantics recorded via lineage, not blocking dependency

### Required model change
Add new task status:
- `superseded`

### Acceptance criteria
- split task produces executable subtasks
- backlog remains a valid DAG
- tests cover split task with 1, 2, N criteria

---

## A3. Enforce strict schemas for all role outputs
Relevant files:
- `packages/llm/src/output-schemas.ts`
- `packages/agents/src/roles/*.ts`
- `packages/prompts/src/prompt-builder.ts`

### Current problem
Only a subset of outputs are validated.

### Missing / weakly enforced outputs
- `PlanOutput`
- `DocsOutput`
- `ExportPayload`
- `BacklogUpdate`
- likely others

### Implementation
Create schemas for every role output and reject unknown or invalid outputs.

### Recommendation
Introduce:
- `RoleOutputSchemaRegistry`
- one schema per role
- runtime check that every role has a registered schema
- test that registry coverage matches `AgentRoleName`

### Acceptance criteria
- no role can execute with an unregistered schema
- invalid LLM output fails fast
- all current agents validated

---

## A4. Deep state validation
Relevant files:
- `packages/state/src/ports/state-validator.ts`
- `packages/core/src/types.ts`

### Current problem
Envelope is validated more strongly than nested domain structures.

### Implementation
Define Zod schemas for:
- Epic
- Feature
- BacklogTask
- Milestone
- DecisionLogItem
- FailureRecord
- ArtifactRecord
- ProjectState

### Extra recommendation
Separate:
- persisted schema
- public API DTO schema
- migration schema

### Acceptance criteria
- every state save passes full schema validation
- migration tests exist
- corrupt snapshots fail with actionable error

---

# Workstream B — Real execution layer

This is the single biggest upgrade needed.

## B1. Introduce an agent tool protocol
Relevant files:
- `packages/agents/src/base-agent.ts`
- `packages/tools/src/index.ts`
- `packages/execution/src/orchestrator.ts`

### Goal
Turn agents from one-shot JSON responders into actors that can use tools safely.

### Implementation model
Add contracts:

```ts
type ToolInvocation =
  | { tool: 'fs.read'; input: {...} }
  | { tool: 'fs.write'; input: {...} }
  | { tool: 'git.diff'; input: {...} }
  | { tool: 'ts.check'; input: {...} }
  | { tool: 'shell.exec'; input: {...} }
  | { tool: 'test.run'; input: {...} };

type AgentTurnResult =
  | { type: 'tool_request'; request: ToolInvocation }
  | { type: 'final_output'; output: TOutput };
```

The orchestrator runs the loop:
1. call agent
2. if tool request, execute with capability checks
3. append observation to transcript
4. continue until final output or limit reached

### Why this matters
Without this, the project cannot become a true engineering system.

### Acceptance criteria
- coder can read files
- reviewer can inspect diffs and diagnostics
- tester can run checks
- all actions logged

---

## B2. Split `packages/tools` into typed adapters
The current tools package is compact, but it should evolve into dedicated adapters and policies.

### Proposed structure
```text
packages/tools/
  src/
    filesystem/
    git/
    typescript/
    shell/
    testing/
    diff/
    search/
    policy/
    evidence/
```

### Add missing tools
- **ShellTool**: safe command execution with allowlists and timeouts
- **PatchTool**: create/apply/revert diff
- **TestRunnerTool**: unit/integration commands
- **RepoSearchTool**: code search, symbol search, dependency graph lookup
- **PackageManagerTool**: `pnpm install`, lockfile checks, outdated deps
- **LintTool**
- **CoverageTool**
- **DockerTool** or sandbox runner

### Acceptance criteria
- adapters are unit-tested
- commands time out
- stdout/stderr captured
- tool permissions enforced centrally

---

## B3. Safe write pipeline
Today `LocalFileSystemTool.writeFile` exists, but there is no safe write choreography.

### Add write modes
- read-only
- propose-only
- sandbox-write
- workspace-write
- protected-write

### Required controls
- allowed module list
- file path policy
- maximum modified files threshold
- protected paths (`package.json`, migrations, lockfile, CI configs, secrets)
- approval-required actions

### Acceptance criteria
- unsafe writes blocked
- all file writes attributed to task/run/role
- diff summary captured

---

## B4. Repository workspace manager
### Need
A job should run against a controlled workspace, not blindly against the live repo.

### Add
- workspace allocation
- branch naming strategy
- cleanup policy
- snapshot of initial diff
- rollback/revert support

### Recommendation
Start with a simple local workspace manager:
- copy worktree or create git worktree
- per-run branch
- cleanup on success/failure

Later upgrade to:
- isolated containers
- remote runners

---

## B5. Build / test / typecheck / lint execution
### Current state
The code has a `TypeScriptTool.check()`, but the runtime does not use it in the actual cycle.

### Add execution stages
- preflight repo state
- after proposed patch: format/lint/typecheck/unit tests
- optionally integration/e2e tests
- publish evidence to state

### Proposed health model extension
Replace single booleans with richer structure:

```ts
health: {
  build: { status, lastCheckedAt, command, summary }
  tests: { status, passed, failed, skipped, durationMs }
  lint: { status, diagnostics }
  typecheck: { status, diagnostics }
}
```

---

# Workstream C — Git lifecycle and delivery

## C1. Branch / commit / PR support
Current repo knows about git status/diff/log only.

### Add
- create branch per task/run
- stage selected files
- generate commit message
- create PR payload
- optionally integrate with GitHub/GitLab API

### Delivery progression
1. local branch only
2. branch + commit
3. PR draft generation
4. PR comment/status updates
5. auto-merge policies for low-risk changes

### Acceptance criteria
- code changes tied to branch and commit
- commit references task ID and run ID
- PR metadata preserved in artifacts

---

## C2. Rich diff intelligence
Add diff analysis layer:
- changed symbol map
- affected modules detection
- risk scoring from diff
- semantic diff summaries
- public API change detector

Useful for:
- reviewer
- tester
- release auditor
- human approval gates

---

# Workstream D — Planning and project management maturity

## D1. Real planner outputs
Relevant files:
- `packages/agents/src/roles/*planner*`
- `packages/core/src/types.ts`

### Need
Planner should not just generate generic tasks. It should generate a normalized backlog graph.

### Add types
```ts
PlanOutput {
  milestones: ...
  epics: ...
  features: ...
  tasks: ...
  assumptions: ...
  risks: ...
  dependencyEdges: ...
}
```

### Upgrade planner behavior
- detect workstreams
- cluster by subsystem
- estimate risk / effort
- identify blockers
- generate acceptance criteria templates
- propose parallelizable tasks

### Acceptance criteria
- planner produces deterministic backlog graph
- backlog can be merged or previewed before apply

---

## D2. Backlog editing lifecycle
Today backlog mutations are basic.

### Add
- draft backlog updates
- preview / diff before apply
- merge planner output into current backlog
- archive/supersede tasks
- deduplicate duplicate tasks
- manual task pinning
- dependency editor
- epic/feature progress rollups

---

## D3. Better milestone engine
### Add
- milestone states with entry/exit checks
- milestone health
- predicted completion
- blockers register
- “ready for execution” validation

---

# Workstream E — Human-in-the-loop controls

Premium systems are not fully autonomous by default. They are **safely autonomous**.

## E1. Approval gates
Add configurable approval rules for:
- package.json changes
- DB migrations
- deleting files
- touching > N files
- changing public APIs
- changes in auth/security modules
- release actions
- production config changes

### Implementation
Introduce:
```ts
ApprovalRequest {
  id
  runId
  taskId
  reason
  requestedAction
  diffSummary
  riskLevel
  expiresAt
}
```

### UI/API
- list pending approvals
- approve/reject with note
- resume run after approval

---

## E2. Policy engine
Move operational safety to configurable policy.

### Policy examples
- max files touched by coder role
- blocked directories
- allowed commands by repo profile
- test minimum before commit
- review required if dependency changed
- release auditor required for p0 tasks

This becomes one of the biggest “premium” features.

---

# Workstream F — Observability and operations

## F1. Structured telemetry
Current system has logs and SSE. Production needs more.

### Add metrics
- run duration
- task lead time
- success/failure rate
- retries by role
- approval wait time
- tool call count
- tokens / cost by role
- files changed per task
- review rejection rate
- flaky test detection

### Add traces
Use OpenTelemetry-style spans:
- run span
- task span
- role execution span
- tool call span
- external API span

### Add audit evidence
Every run page should show:
- prompt used
- tool actions
- outputs
- diffs
- diagnostics
- decisions
- artifacts

---

## F2. Dead-letter and recovery
### Need
Failed runs should be resumable.

### Add
- job state machine
- dead-letter queue
- resume from checkpoint
- replay / rerun from last successful step
- “retry with stronger prompt”
- “retry with different model”

---

## F3. Queue/worker architecture
Current API can trigger execution directly. Premium production should separate:
- API plane
- orchestration scheduler
- worker plane
- sandbox runners

### Suggested components
- `api-service`
- `scheduler-service`
- `worker-service`
- `sandbox-runner`
- `event-stream-service`

---

# Workstream G — Security, tenancy, and compliance

## G1. API authentication and authorization
Relevant file:
- `apps/dashboard-api/src/main.ts`

### Current concern
- CORS is `*`
- no auth visible
- control endpoints open by default

### Add
- API key or JWT auth
- org/project scopes
- RBAC roles:
  - admin
  - operator
  - reviewer
  - observer
- signed action tokens for approvals

---

## G2. Secret and config safety
### Add
- secret scanning in repo reads
- redact secrets from prompts and logs
- policy for forbidden files
- env/schema validation per environment
- safe handling of provider keys

---

## G3. Multitenancy
To reach premium/SaaS-grade level, add:
- org ID
- project ID namespace
- per-tenant settings
- per-tenant model policy
- per-tenant quotas and billing hooks

Likely state layer changes:
- all persisted entities scoped by tenant/org/project
- indexes on `(org_id, project_id, created_at)`

---

## G4. Compliance-grade auditing
### Add
- immutable action ledger
- who approved what and when
- exportable audit report
- change-control evidence bundle

---

# Workstream H — Product UX and premium features

This is where the project becomes clearly better than a bare internal orchestrator.

## H1. Interactive run dashboard
Built on the existing SSE stream.

### Add views
- live run timeline
- per-task evidence
- diff preview
- test output
- retry cause analysis
- approval inbox
- run cost dashboard
- milestone burndown

---

## H2. Natural-language control plane
Add commands like:
- “run only low-risk TypeScript cleanup tasks”
- “show all blocked p0 items”
- “prepare PR draft for completed tasks in milestone X”
- “replan auth subsystem”

Translate these into typed commands.

---

## H3. Repository intelligence
New premium feature set:
- code map / architecture graph
- ownership inference
- hotspot detection
- dependency risk map
- churn-based prioritization
- historical failure clustering

This can feed planner, architect, release auditor.

---

## H4. Evaluation mode / dry runs
One of the best premium features:
- run in simulation mode
- no writes
- produce proposed backlog / diffs / tool actions
- compare model strategies
- benchmark prompts and policies

---

## H5. Model strategy and cost controls
### Add
- role-to-model routing
- cheaper model for planning, stronger model for coding/review
- max token budgets per run
- fallback model
- retry with alternate model
- cost report per task and run

---

## H6. Knowledge and memory layer
Add project memory beyond raw `ProjectState`:
- repo conventions
- coding standards
- common failure patterns
- test commands
- module ownership
- glossary
- known bad files
- migration guides

Useful as:
- prompt context
- planner input
- policy input
- reviewer heuristics

---

## H7. Release orchestration
For premium release management:
- checklist generation
- release readiness gates
- changelog generation
- issue aggregation
- regression watch
- rollback notes
- deployment/export integration

---

# Workstream I — Data model evolution

## I1. Enrich task model
Current `BacklogTask` is too small for premium execution.

### Add fields
```ts
description?: string
parentTaskId?: string
supersedesTaskId?: string
splitGroupId?: string
labels?: string[]
effort?: 'xs'|'s'|'m'|'l'|'xl'
riskFactors?: string[]
repoScope?: {
  allowedModules: string[]
  allowedPaths: string[]
  forbiddenPaths: string[]
}
executionMode?: 'analysis'|'propose'|'apply'
approvalStatus?: 'not_required'|'pending'|'approved'|'rejected'
evidenceIds?: string[]
branchName?: string
commitSha?: string
prId?: string
```

---

## I2. Add run-step persistence
Current execution stream is great live, but long-term production needs durable steps.

### Add entity
`run_step_log`
- runId
- stepSeq
- stepKind
- role
- tool
- input summary
- output summary
- duration
- status

This enables:
- replay
- dashboard history
- analytics

---

## I3. Add evidence/artifact content model
Current artifact model is metadata-only.

### Add
- artifact blob reference
- text body
- mime type
- compressed logs
- diff blobs
- test report blobs

Could be stored in:
- DB for small items
- object storage for large items

---

# Workstream J — Testing and QA

## J1. Expand test matrix
Current tests are decent but mostly structural/unit-level.

### Add
- end-to-end orchestration tests
- agent tool loop tests
- workspace tests
- patch apply/revert tests
- approval/resume tests
- migration tests
- chaos/failure injection tests

---

## J2. Golden prompt / output tests
For each role:
- deterministic mock outputs
- schema conformance
- failure mode coverage
- regression suites for prompt changes

---

## J3. Real repo fixture tests
Create sample repos:
- TypeScript library
- Nest app
- monorepo
- repo with failing tests
- repo with lint drift
- repo with migration task

Then run realistic scenarios:
- fix type errors
- add unit tests
- update docs
- split oversized task
- create PR payload

---

# Workstream K — Documentation and developer experience

## K1. Architecture docs
Add and maintain:
- system context
- runtime sequence diagrams
- state model docs
- tool protocol docs
- policy engine docs
- operator manual
- incident playbook

---

## K2. Local developer bootstrap
### Improve
- one-command local start
- example envs
- docker-compose for Postgres
- example sample repo
- seed state
- demo workflow

---

## K3. Plugin/adapter development model
To become premium/extensible:
- tool adapter interface docs
- provider SDK
- custom role support
- external integration adapter interface
- versioned extension contracts

---

## K4. Repo profile system
Different repositories need different commands and policies.

### Add repo profiles
```ts
RepoProfile {
  packageManager
  buildCommand
  testCommand
  lintCommand
  typecheckCommand
  coverageCommand?
  protectedPaths
  framework
  riskRules
}
```

This is critical for production reliability.

---

## 6. New features worth adding that do not exist yet

Below are high-value feature ideas that are not meaningfully implemented now and would materially improve the product.

## 6.1 Execution sandbox snapshots
Before/after workspace snapshot with diff, diagnostics, and rollback checkpoint.

**Why valuable:** safe debugging and reproducibility.

---

## 6.2 Architectural regression guard
Architect role automatically compares current repo graph to previous accepted baseline:
- new cycles
- new boundary violations
- dependency explosions
- cross-layer leaks

**Why valuable:** prevents slow architectural decay.

---

## 6.3 Auto-generated remediation plans
When review or tests fail multiple times, instead of only split/escalate:
- root-cause hypothesis
- remediation plan
- alternate strategy proposals
- ask for approval if needed

---

## 6.4 Change budget / blast radius controls
Per run:
- max files
- max LOC changed
- max public APIs touched
- max package dependencies changed

**Why valuable:** enterprise-grade safety.

---

## 6.5 PR-ready review bundle
Generate a complete change packet:
- summary
- diff overview
- impacted modules
- test evidence
- known risks
- rollback notes
- release notes
- reviewer checklist

This is a premium differentiator.

---

## 6.6 Cost and efficiency optimizer
Show:
- token cost by role
- low-value retries
- expensive prompts
- candidate model downgrades
- cached/reused analysis opportunities

---

## 6.7 Failure intelligence dashboard
Cluster failures by:
- role
- module
- error signature
- command
- repo profile
- prompt version

Then surface:
- top recurring issues
- flaky validations
- low-confidence modules

---

## 6.8 Repo onboarding wizard
For a new repo:
- detect framework
- infer commands
- discover modules
- propose risk rules
- generate initial backlog
- create baseline architecture snapshot

---

## 6.9 Release freeze / safe mode
Switch the platform into:
- analysis-only
- no-write mode
- docs-only mode
- release freeze mode

Excellent for enterprises and regulated environments.

---

## 6.10 Prompt and policy versioning
Track:
- prompt version used per run
- policy version used per run
- model version used per run

Then compare outcomes across versions.

---

## 7. Premium / production readiness checklist

## 7.1 Must-have for production
- strict schemas for all role outputs
- full state validation
- safe workspace writes
- approval gates
- auth + RBAC
- durable run-step logs
- retries/resume
- metrics + traces
- robust repo profile support
- end-to-end tests

## 7.2 Must-have for premium tier
- policy engine
- multitenancy
- model routing / cost controls
- PR generation
- architectural regression guard
- approval inbox UI
- evaluation/dry-run mode
- evidence bundles
- failure intelligence

## 7.3 Must-have for enterprise-grade
- SSO/SAML
- audit export
- immutable approval records
- environment isolation
- secret redaction
- tenant quotas
- compliance-friendly logs
- deployment topology docs
- incident playbooks

---

## 8. Recommended delivery sequence

## Phase 0 — Stabilization (1–2 weeks)
Goal: fix correctness issues before expansion.

### Deliverables
- fix `runTask(taskId)`
- fix split deadlock
- strict role schema registry
- full state validation
- add missing tests for above

### Exit criteria
- no known correctness bug remains in execution semantics
- all role outputs validated

---

## Phase 1 — Tool-enabled MVP execution (2–4 weeks)
Goal: convert platform from reasoning-only to action-capable.

### Deliverables
- `ToolExecutionContext`
- agent tool loop
- shell + fs + ts + git + patch tools
- read-only review/test flows
- workspace manager
- durable step logs

### Exit criteria
- coder/reviewer/tester can operate on real workspace
- all actions and outputs captured

---

## Phase 2 — Safe write + validation pipeline (3–5 weeks)
Goal: allow bounded code changes safely.

### Deliverables
- patch generation/apply/revert
- lint/typecheck/test commands
- approval gates
- write policy
- diff intelligence
- branch management

### Exit criteria
- platform can complete low-risk TS tasks in sandbox and produce validated diff

---

## Phase 3 — Delivery workflow (3–4 weeks)
Goal: get from changes to shippable engineering output.

### Deliverables
- commit generation
- PR draft generation
- review bundle export
- backlog preview/apply improvements
- release auditor improvements

### Exit criteria
- low-risk task can end with branch + commit + PR-ready package

---

## Phase 4 — Production hardening (3–6 weeks)
Goal: operationally reliable service.

### Deliverables
- auth/RBAC
- queue/worker split
- metrics/traces
- dead-letter/resume
- multitenant data model
- stronger dashboard

### Exit criteria
- safe to run as multi-user service

---

## Phase 5 — Premium intelligence layer (ongoing)
Goal: differentiation.

### Deliverables
- architecture regression guard
- cost optimization
- evaluation mode
- failure intelligence
- repo onboarding wizard
- knowledge/memory layer

---

## 9. Suggested GitHub epics and issues

## Epic 1 — Execution Core v2
### Issues
- [ ] Add `runSingleTask(taskId)` to orchestrator
- [ ] Introduce `ToolExecutionContext`
- [ ] Add agent turn protocol for tool requests
- [ ] Add max-turn and timeout controls
- [ ] Persist run-step logs
- [ ] Add resume-from-step support

---

## Epic 2 — State and Schema Hardening
### Issues
- [ ] Add full Zod schemas for state entities
- [ ] Add role output schema registry
- [ ] Fail startup if any role lacks schema
- [ ] Add state migration tests
- [ ] Introduce task lineage fields
- [ ] Add `superseded` task status

---

## Epic 3 — Workspace and Repo Safety
### Issues
- [ ] Add workspace manager
- [ ] Add path allowlist/denylist
- [ ] Add protected files policy
- [ ] Add patch apply/revert tool
- [ ] Add diff summary generator
- [ ] Add write evidence logging

---

## Epic 4 — Validation Pipeline
### Issues
- [ ] Add shell command runner with allowlist
- [ ] Add lint/typecheck/test orchestration
- [ ] Extend health model with evidence
- [ ] Store diagnostics blobs
- [ ] Add retry policy based on command evidence

---

## Epic 5 — Git Delivery
### Issues
- [ ] Create branch per run
- [ ] Generate commit messages
- [ ] Stage only approved files
- [ ] Create PR payload schema
- [ ] Add GitHub/GitLab integration adapter

---

## Epic 6 — Human Approval and Policy
### Issues
- [ ] Add approval request entity
- [ ] Add approval API
- [ ] Add approval dashboard view
- [ ] Introduce configurable policy engine
- [ ] Add high-risk action rules

---

## Epic 7 — Dashboard Premium UX
### Issues
- [ ] Add live run timeline
- [ ] Add diff viewer
- [ ] Add test output panel
- [ ] Add blocked tasks view
- [ ] Add approval inbox
- [ ] Add cost analytics panel

---

## Epic 8 — Security and SaaS Readiness
### Issues
- [ ] Add JWT/API key auth
- [ ] Add RBAC
- [ ] Add tenant scoping
- [ ] Redact secrets in prompts/logs
- [ ] Add audit export endpoint

---

## Epic 9 — Planning Intelligence
### Issues
- [ ] Add `PlanOutput` domain contract
- [ ] Add backlog draft preview
- [ ] Add dependency graph validation
- [ ] Add deduplication of planner tasks
- [ ] Add milestone readiness checks

---

## Epic 10 — Reliability and Testing
### Issues
- [ ] Add real repo fixture suite
- [ ] Add chaos tests for failing tools
- [ ] Add approval/resume integration tests
- [ ] Add migration rollback tests
- [ ] Add prompt regression suite

---

## 10. KPIs to track after implementation

To know whether the project really reached premium/prod quality, measure:

### Engineering execution KPIs
- task completion rate
- review rejection rate
- test pass rate
- average retries per task
- mean task cycle time
- % tasks completed without human intervention
- % runs requiring approval

### Safety KPIs
- blocked unsafe writes
- failed policy violations
- secrets redacted
- rollback success rate
- incidents caused by agent changes

### Product KPIs
- time to onboard a new repo
- time to first accepted PR
- cost per completed task
- operator time saved
- number of successful low-risk auto-fixes

---

## 11. Concrete recommendation

If only **three investments** can be made right now, they should be:

### 1. Build the tool-execution runtime
This is the step that changes the project category.

### 2. Add safe workspace + validation pipeline
Without this, code changes are not trustworthy.

### 3. Add policy + approval + observability
Without this, it cannot be production-safe.

That trio will convert the codebase from a promising orchestrator into a credible autonomous engineering platform.

---

## 12. Final verdict

The project does **not** need a full rewrite.

It needs a **structured second-generation implementation program** focused on:

- correctness hardening
- real execution over repositories
- safe write and validation workflows
- stronger contracts and state semantics
- premium operational features

### My overall assessment
- **Architecture foundation:** strong
- **Execution realism:** incomplete
- **Production readiness:** partial
- **Premium differentiation:** not there yet, but very achievable

### Most important conclusion
The biggest opportunity is that the current codebase already has the right backbone:
- workflow
- state
- orchestration
- agent abstraction
- operational interfaces

If the missing execution layer, policy engine, and premium controls are implemented carefully, this can evolve into a **serious premium AI engineering platform**, not just an internal demo orchestrator.

---

## 13. Suggested next artifact after this report

The best next document would be:

**`target-architecture-v2.md`** containing:
- exact package restructuring
- class/interface proposals
- sequence diagrams
- DB entity additions
- API contract changes
- rollout strategy with migration path from current code

That would turn this strategic plan into an implementation-ready blueprint.
