# Post-MVP tasks

This directory contains decomposed post-MVP feature tasks derived from:

- `docs/ai-orchestrator-spec-v3.md` §25
- `docs/ai-orchestrator-rfc-v4.md` §23
- `docs/ts-linq-ai-orchestrator-full-spec.md` §20

Conventions:

- One file = one feature task
- One task = one branch
- One task = one commit
- Every task must end with tests + `npm run lint` + `npm run typecheck`
- Any backend/API work must use NestJS

Recommended execution order is captured in `tasks/post_mvp_task_list.md`.
