1. Feature summary
Ввести единый доменный контракт `ExecutionPolicyDecision` и минимальные value-object валидаторы, чтобы policy-решения были типизированными, трассируемыми и пригодными для аудита.

2. Relevant modules
- `packages/core` (доменные контракты и инварианты policy-решений).
- Потенциально `packages/application` (потребление контракта в use-case слоях).

3. Existing behavior
Сейчас в документах автономного контура policy-решения описаны как целевое состояние, но нет гарантии, что контракт централизован и одинаково используется между orchestration и execution-path.

4. Proposed design
- Добавить в domain-слой контракт `ExecutionPolicyDecision` (как в `docs/autonomous/spec.md`).
- Ввести ограниченные enum/union типы для `riskClass` и `decision`.
- Добавить фабрику/конструктор с базовой валидацией обязательных полей (`decisionId`, `subject.*`, `policyVersion`, `evaluatedAt`).
- Добавить сериализуемый формат для логов/аудита без provider-specific полей.

5. Files likely to change
- `packages/core/**` (новые типы/контракты policy).
- `packages/core/**/*.test.ts` (тесты на инварианты контракта).

6. Risks
- Риск скрытого расхождения форматов, если другие слои пока используют ad hoc объекты.
- Риск несовместимости с текущими event payload, если они не типизированы через domain contract.

7. Test plan
- Unit: создание валидного policy decision.
- Unit: отказ при отсутствующих обязательных полях.
- Unit: отказ при невалидных `riskClass`/`decision`.
- Regression: сериализация/десериализация без потери полей.

8. Rollout / migration notes
- Additive-изменение: сначала добавить контракт, затем постепенно адаптировать потребителей.
- На переходном этапе разрешить mapping-адаптер из legacy-формата.

9. Recommendation
Начать с этой задачи, так как она формирует базовый typed contract для всех последующих safety-задач.
