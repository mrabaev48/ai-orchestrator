1. Feature summary
Реализовать `AgentActionLoopEngine` с bounded steps, timeout budget и cancellation propagation.

2. Relevant modules
- `packages/execution` (step engine).
- `packages/application` (инициализация run budget).
- `packages/tools` (AbortSignal propagation).

3. Existing behavior
В спеках задан think/act/observe цикл, но production-требования к budget/cancellation/timeout могут быть неполно закреплены в одном deterministic протоколе.

4. Proposed design
- Ввести конфигурируемые лимиты: max steps, max wall-time, max retries per step.
- На каждый tool request передавать `timeoutMs` + `AbortSignal`.
- При cancel/timeout фиксировать explicit evidence и checkpoint.
- Добавить stop conditions (`completed`, `escalate`, `budget_exhausted`).

5. Files likely to change
- `packages/execution/**` (action loop engine).
- `packages/core/**` (типы step intent/outcome).
- `packages/execution/**/*.test.ts` (timeout/cancel/retry сценарии).

6. Risks
- Зависшие subprocess при неполной cancellation propagation.
- Недетерминированные остановки при конкурентном обновлении budget.

7. Test plan
- Success: цикл завершает задачу в пределах budget.
- Failure: timeout корректно прерывает step и пишет evidence.
- Cancellation: ручная отмена останавливает дальнейшие шаги.
- Retry: bounded retry соблюдает max-attempt.

8. Rollout / migration notes
- По умолчанию выставить консервативные лимиты и метрики budget exhaustion.
- Для существующих run-profile добавить compatibility defaults.

9. Recommendation
Реализовать как центральный runtime-компонент после policy/transition guard.
