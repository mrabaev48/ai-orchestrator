1. Feature summary
Формализовать closed transition table и guard-валидацию state transitions для run/task/step lifecycle.

2. Relevant modules
- `packages/core` (state machine и инварианты).
- `packages/application` (use-case orchestration).
- `packages/state` (persisted transition events).

3. Existing behavior
Документация требует explicit transitions и hard-fail на illegal переходы, но текущая реализация может допускать неявные или неоднозначные изменения статуса.

4. Proposed design
- Вынести transition map в отдельный доменный модуль.
- Добавить API `assertTransitionAllowed(from, to, context)`.
- На illegal переход — structured domain error с кодом и контекстом.
- Логировать все transitions в evidence/event log.

5. Files likely to change
- `packages/core/**` (state transition policy).
- `packages/application/**` (вызовы guard перед persist).
- `packages/core/**/*.test.ts` (табличные тесты переходов).

6. Risks
- Регрессии в текущих сценариях, где были implicit переходы.
- Рост числа отказов на edge-cases без миграции старых статусов.

7. Test plan
- Unit: разрешенные переходы проходят.
- Unit: запрещенные переходы hard-fail.
- Regression: повторный terminal transition не приводит к silent success.

8. Rollout / migration notes
- Добавить mapping legacy статусов в canonical state до включения strict режима.
- На этапе rollout писать метрики по rejected transitions.

9. Recommendation
Сделать до deep recovery-логики: корректная state-модель — основа deterministic resume.
