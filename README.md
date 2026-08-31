# AI Orchestrator

A stateful **engineering control plane** that coordinates specialized AI roles (Bootstrap Analyst, Architect, Planner, Coder, Reviewer, Tester, Docs Writer, Release Auditor, State Steward, Integration Manager, …) to perform bounded, auditable, policy-driven work on a target repository.

It is deliberately **not** a monolithic "super-agent" running on prompt history. Every run goes through explicit policy evaluation, durable state, milestone-based progression, review/test gates, and retry → split → escalate logic, with defined points for human intervention.

> Full design rationale: [`docs/ai-orchestrator-rfc-v4.md`](docs/ai-orchestrator-rfc-v4.md) · Production/autonomy roadmap: [`docs/autonomous/spec.md`](docs/autonomous/spec.md) and [`docs/autonomous/pland.md`](docs/autonomous/pland.md)

## Status

MVP and the full post-MVP roadmap are implemented, including the production-autonomy phase (policy engine, idempotency/dedup, evidence trail, repo mutation pipeline, distributed queue/locks/leases, multi-tenant guards, observability/SLO, autonomy level controller L0–L5). See [`tasks/mvp_task_list.md`](tasks/mvp_task_list.md), [`tasks/post_mvp_task_list.md`](tasks/post_mvp_task_list.md), and [`tasks/autonomous/README.md`](tasks/autonomous/README.md) for the task breakdown.

## Architecture

A pnpm/Turborepo workspace with explicit composition at the edge — see [`docs/runtime-architecture.md`](docs/runtime-architecture.md) for the full rationale.

```
apps/
  control-plane   CLI entrypoint — parses commands, delegates to application services
  dashboard-api   NestJS read-side API over runtime state
  worker          Long-running worker process driving orchestration cycles
packages/
  application     Composition root + use-case services (bootstrap, architecture, planning, docs, …)
  execution       Orchestrator runtime, run-cycle, action loop, mutation pipeline, locks/leases/queue
  workflow        Stage transitions, task routing, retry policy
  agents          Role contracts, registry, concrete role implementations
  prompts         Prompt pipeline and templates
  state           Persistence ports + adapters (in-memory, PostgreSQL, migrations)
  core            Domain model, invariants, policy decisions, domain events
  tools           Tool adapter contracts (filesystem, git, shell, typescript, …)
  llm             LLM client abstraction + provider adapters
  shared          Runtime config, logging, shared errors
  types           Shared TypeScript types
```

Composition rules: the CLI never wires orchestrator dependencies directly; runtime assembly happens in `packages/application/src/runtime-factory.ts`; read-side output goes through `packages/application/src/read-models.ts`.

## Requirements

- Node.js (see `package.json` engines / `.nvmrc` if present)
- [pnpm](https://pnpm.io/) — version pinned via `packageManager` in `package.json`
- PostgreSQL, only if you run with `STATE_BACKEND=postgresql` (the default); use `STATE_BACKEND=memory` to skip this entirely for local exploration

## Getting started

```bash
pnpm install
```

Run everything with safe local defaults (in-memory state, mock LLM provider, synthetic role runtime — no external services or API keys required):

```bash
export STATE_BACKEND=memory LLM_PROVIDER=mock WORKFLOW_ROLE_PROVIDER_MODE=synthetic

pnpm run bootstrap
pnpm run run-cycle
pnpm run show-state
```

`WORKFLOW_ROLE_PROVIDER_MODE=production` (the default) requires a real `LLM_PROVIDER` (`openai`/`anthropic`) and `LLM_API_KEY` — use `synthetic` for local exploration without provider credentials.

Validate the whole repo (package boundaries, lint, typecheck, tests):

```bash
pnpm run check
```

## Configuration

Runtime config is loaded and validated from environment variables (`packages/shared/src/config/runtime-config.ts`); invalid config hard-fails at startup. Key variables:

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `mock` | `openai` \| `anthropic` \| `mock` |
| `LLM_MODEL` | `mock-model` | Model identifier for the selected provider |
| `STATE_BACKEND` | `postgresql` | `memory` \| `postgresql` |
| `POSTGRES_DSN` | `postgresql://localhost:5432/ai_orchestrator` | Used when `STATE_BACKEND=postgresql` |
| `WORKFLOW_APPROVAL_GATE_MODE` | `disabled` | Enable human-approval gating for risky actions |
| `TOOL_WRITE_MODE` | `workspace-write` | Guardrail on filesystem mutation scope |
| `MAX_STEPS_PER_RUN` | `8` | Hard cap on orchestration steps per run |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `json` | Structured logging |

See the full schema in [`packages/shared/src/config/runtime-config.ts`](packages/shared/src/config/runtime-config.ts) for every option (LLM cost/token budgets, retry limits, distributed locking, workspace management, observability retention, etc.).

## CLI commands

Run via `pnpm run <script>`, each mapping to `apps/control-plane/src/cli.ts`:

| Script | What it does |
|---|---|
| `bootstrap` | Initialize runtime + initial project state + snapshot |
| `analyze-architecture` | Run the Architect role over the repository |
| `plan-backlog` | Generate/update backlog via the Planner role |
| `generate-docs` | Produce a bounded documentation artifact |
| `assess-release` | Run release-readiness assessment |
| `check-state` | Validate state integrity and produce repair guidance |
| `prepare-export` | Build an external integration export payload |
| `run-cycle` | Execute one orchestration cycle end-to-end |
| `run-task -- --task-id <id>` | Force-execute a specific task |
| `show-state [-- --json true]` | Print current project state |
| `export-backlog [-- --format md\|json --out <path>]` | Export the backlog |
| `resume-failure -- --failure-id <id>` | Resume a recorded failure |
| `replay-failure -- --failure-id <id>` | Replay a recorded failure |
| `state-migrate` | Apply pending PostgreSQL state migrations |

## Other entrypoints

- **Dashboard API** — `pnpm run dashboard-api:start` (NestJS, defaults to `127.0.0.1:3100`, configurable via `DASHBOARD_API_HOST` / `DASHBOARD_API_PORT`)
- **Worker** — `pnpm run worker:start` (polls and executes orchestration cycles continuously)

## Documentation map

- [`docs/ai-orchestrator-rfc-v4.md`](docs/ai-orchestrator-rfc-v4.md) — production-oriented architecture RFC (domain model, schemas, contracts, roadmap)
- [`docs/ai-orchestrator-spec-v3.md`](docs/ai-orchestrator-spec-v3.md) — MVP specification
- [`docs/runtime-architecture.md`](docs/runtime-architecture.md) — current module boundaries and composition rules
- [`docs/autonomous/spec.md`](docs/autonomous/spec.md) / [`docs/autonomous/pland.md`](docs/autonomous/pland.md) — production-autonomy technical spec and phased rollout plan
- [`tasks/`](tasks) — MVP, post-MVP, and autonomy task breakdowns, plus a self-audit issue log in [`tasks/autonomous/issues/`](tasks/autonomous/issues)

## License

ISC (see `package.json`).
