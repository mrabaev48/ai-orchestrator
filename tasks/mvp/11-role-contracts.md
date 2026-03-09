# 11 — Role contracts (`AgentRole`, `RoleRequest`, `RoleResponse`, `RoleExecutionContext`)

## Goal

Define strictly typed role (agent) contracts that provide:
- separation of role responsibilities
- structured output
- the ability to validate results and apply review/testing gates

## Context and business logic

Roles do not own workflow transitions and do not mutate state directly. All meaningful outputs must be structured and (where feasible) schema-validated.

## Requirements

### Functional

- Types:
  - `AgentRoleName` (string union at least for MVP roles)
  - `AgentRole<TInput, TOutput>` (execution contract)
  - `RoleRequest<TInput>`: role, objective, input, acceptanceCriteria, expectedOutputSchema
  - `RoleResponse<TOutput>`: role, summary, output, warnings, risks, needsHumanDecision, confidence
  - `RoleExecutionContext`: access to state summary + tool profile + logger + run/task metadata
- Support optional `validate()` per role (MVP: at least a hook for schema validation).

### Non-functional

- No `any` in public contracts (use `unknown` and generics).
- Stable schemas for structured output (for the LLM).

## Stack

- TypeScript

## Implementation details

- `packages/core/roles/*`:
  - contracts + base context types
- `packages/execution`:
  - create `RoleExecutionContext`
  - call `role.execute(request, ctx)`
- `packages/prompts`:
  - `expectedOutputSchema` must match `OptimizedPrompt.outputSchema`

## Definition of Done (DoD)

- The Orchestrator can invoke any MVP role through the common interface.
- Role results are serializable/loggable and can be checked via the schema validation step.

## Test plan

- Unit: compile/typecheck the contract; basic role mocks
- Integration: mock LLM → PromptEngineerAgent → returns `OptimizedPrompt` via `RoleResponse`

## Documentation links

- Spec v3: Role contract: [`docs/ai-orchestrator-spec-v3.md` §11.3](../../docs/ai-orchestrator-spec-v3.md)
- Spec v3: “All meaningful outputs must be structured”: [`docs/ai-orchestrator-spec-v3.md` §4.4](../../docs/ai-orchestrator-spec-v3.md)

