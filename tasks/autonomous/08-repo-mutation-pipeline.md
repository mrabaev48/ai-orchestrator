1. Feature summary
Собрать поэтапный `RepoMutationPipeline` (workspace → branch → apply → verify → commit/push → draft PR) с компенсациями на сбоях.

2. Relevant modules
- `packages/execution` (pipeline coordinator).
- `packages/tools` (git/ci/scan adapters).
- `packages/application` (gates и approval integration).

3. Existing behavior
В roadmap определены стадии мутации и quality gates, но требуется системная реализация с recoverable состояниями и partial success обработкой.

4. Proposed design
- Явно реализовать стадии:
  `workspace_prepare`, `branch_prepare`, `change_apply`, `verification`, `commit_prepare`, `push_prepare`, `pr_draft_prepare`, `finalize`.
- На каждом stage: входной контракт, timeout, retry policy, evidence emission.
- Compensation:
  - apply fail → restore snapshot;
  - verification fail → stop без push;
  - push/pr fail → bounded retry + escalation.
- Обязательные verification gates: build/lint/typecheck/test/security.

5. Files likely to change
- `packages/execution/**` (pipeline stages).
- `packages/tools/**` (git/verification adapters).
- `packages/application/**` (approval/gate orchestration).

6. Risks
- Частичные side-effects при ошибках поздних стадий.
- Увеличение времени выполнения без грамотного budget management.

7. Test plan
- Success path: полный цикл до draft PR.
- Failure path: verification fail не создает commit/push.
- Regression: повторный запуск после сбоя корректно resume/compensate.
- Security gate: уязвимость блокирует продвижение стадии.

8. Rollout / migration notes
- Релиз по autonomy levels (сначала low-risk tasks).
- Для high-risk включить mandatory approval перед `push_prepare`.

9. Recommendation
Финальный интеграционный этап после готовности policy, idempotency, evidence и action loop.
