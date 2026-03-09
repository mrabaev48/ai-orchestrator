
# AI Orchestrator for ts-linq — Technical Specification v2
Version: v2 (Extended Architecture Edition)

This document extends the v1 specification and adds:

- detailed architecture layers
- package dependency map
- database schema
- orchestration sequence diagrams
- API contracts
- CLI contracts
- execution lifecycle
- safety guardrails
- role interaction diagrams

---

# 1. System Architecture (Layered)

```mermaid
flowchart TB

subgraph Apps
A1[control-plane]
A2[dashboard-api]
A3[worker-cli]
end

subgraph Core
C1[core domain]
C2[workflow engine]
C3[state store]
C4[prompt system]
end

subgraph Agents
AG1[manager]
AG2[prompt engineer]
AG3[task manager]
AG4[architect]
AG5[planner]
AG6[coder]
AG7[reviewer]
AG8[tester]
end

subgraph Infra
I1[LLM providers]
I2[tool adapters]
I3[persistence]
I4[observability]
end

Apps --> Core
Core --> Agents
Agents --> Infra
Core --> Infra
```

---

# 2. Package Dependency Map

```mermaid
flowchart LR

core --> workflow
core --> prompts
core --> agents

workflow --> execution
state --> execution

execution --> agents
execution --> tools
execution --> llm

agents --> prompts
agents --> tools

integrations --> core
integrations --> state
```

Rules:

- core cannot depend on infra
- agents cannot depend on execution
- workflow cannot depend on tools

---

# 3. Database Schema (State Store)

Initial storage uses SQLite.

```mermaid
erDiagram

PROJECT_STATE ||--o{ BACKLOG_TASK : contains
PROJECT_STATE ||--o{ MILESTONE : contains
PROJECT_STATE ||--o{ DECISION_LOG : records
PROJECT_STATE ||--o{ FAILURE_RECORD : tracks

BACKLOG_TASK {
 string id
 string title
 string kind
 string priority
 string status
}

MILESTONE {
 string id
 string title
 string status
}

DECISION_LOG {
 string id
 string summary
 string createdAt
}

FAILURE_RECORD {
 string id
 string taskId
 string role
 string reason
}
```

---

# 4. Execution Lifecycle

```mermaid
sequenceDiagram

participant Manager
participant PromptEngineer
participant Role
participant Reviewer
participant Tester
participant State

Manager->>State: load state
Manager->>Manager: select task
Manager->>PromptEngineer: optimize prompt
PromptEngineer-->>Manager: prompt

Manager->>Role: execute task
Role-->>Manager: result

Manager->>Reviewer: review result
Reviewer-->>Manager: review verdict

Manager->>Tester: test result
Tester-->>Manager: test result

Manager->>State: commit state
```

---

# 5. CLI Contracts

control-plane CLI commands

```
control-plane bootstrap
control-plane run-cycle
control-plane run-task <task-id>
control-plane run-milestone <milestone-id>
control-plane show-state
control-plane show-backlog
control-plane export-backlog
control-plane export-summary
```

---

# 6. API Contracts (dashboard-api)

Example endpoints

GET /state

Returns:

```
{
  milestone: string,
  activeTask: string,
  repoHealth: string
}
```

GET /backlog

```
{
 tasks: BacklogTask[]
}
```

GET /runs

```
{
 executions: ExecutionSummary[]
}
```

---

# 7. Orchestrator Lifecycle

Orchestrator loop pseudocode

```
while not stopCondition:

 load state

 task = selectTask()

 prompt = promptEngineer.optimize()

 result = role.execute()

 review = reviewer.execute()

 if not review.approved:
     recordFailure()
     continue

 test = tester.execute()

 if not test.passed:
     recordFailure()
     continue

 commitState()
```

---

# 8. Guardrails

Hard rules enforced by Manager:

- coder cannot approve code
- reviewer cannot change code
- tester cannot change code
- architect cannot write code
- tasks cannot skip review if code changed
- tasks cannot skip testing if runtime behavior changed

Safety limits

```
maxRetriesPerTask = 3
maxStepsPerRun = 200
maxTasksPerMilestone = configurable
```

---

# 9. Role Interaction Diagram

```mermaid
flowchart TD

Manager --> PromptEngineer
Manager --> TaskManager
Manager --> Architect
Manager --> Planner
Manager --> Coder
Manager --> Reviewer
Manager --> Tester

Coder --> Reviewer
Reviewer --> Tester
Tester --> Manager
```

---

# 10. Tool Adapter Model

Tools exposed to roles:

FilesystemTool

```
readFile(path)
writeFile(path)
listFiles(path)
```

GitTool

```
status()
diff()
commit()
```

TypeScriptTool

```
check()
diagnostics()
```

PostgresTool

```
runQuery()
explainQuery()
```

---

# 11. Observability

Logs

- cycle_start
- task_selected
- role_execution
- review_result
- test_result
- state_commit

Metrics

- tasks_completed
- retries
- failure_rate
- avg_cycle_time

---

# 12. Security / Safety

Write operations must be scoped.

Allowed write locations

- repo root
- project modules

Forbidden

- system files
- orchestration runtime code itself

---

# 13. Post-MVP Architecture

Add:

- distributed workers
- queue system
- parallel execution
- advanced repo analysis
- automated PR creation
- semantic diffing
- architecture evolution tracking

---

# 14. Implementation Roadmap

Phase 1
core domain + state store

Phase 2
workflow engine

Phase 3
prompt system + role registry

Phase 4
manager + coder + reviewer + tester

Phase 5
bootstrap analyst + architect + planner

Phase 6
tools + repo analysis

Phase 7
dashboard api

Phase 8
integrations

---

# 15. Final Architecture Diagram

```mermaid
flowchart TB

User --> CLI
CLI --> Manager

Manager --> Workflow
Manager --> Agents
Manager --> State

Agents --> LLM
Agents --> Tools

State --> DB
Tools --> Repo
Tools --> Postgres

Dashboard --> State
```

---

END OF SPEC
