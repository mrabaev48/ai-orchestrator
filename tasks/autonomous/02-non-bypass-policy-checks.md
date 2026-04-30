1. Feature summary
Встроить non-bypass policy checks в preflight/postflight и перед side-effectful action, чтобы исключить обход governance.

2. Relevant modules
- `packages/application` (orchestrated use-cases).
- `packages/execution` (action loop и stage transitions).
- `packages/core` (policy decision invariants).

3. Existing behavior
Документация требует обязательную policy evaluation для мутаций, но фактическая защита от обхода в runtime может быть неполной или нецентрализованной.

4. Proposed design
- Добавить guard-хуки policy в:
  - preflight run;
  - каждый side-effectful step action;
  - postflight finalize.
- На `deny` — hard stop с явным domain error.
- На `requires_approval` — перевод в approval lifecycle без выполнения действия.
- Все решения привязывать к evidence id/correlation id.

5. Files likely to change
- `packages/application/**` (use-cases, orchestration flow).
- `packages/execution/**` (step execution gates).
- `packages/core/**` (ошибки/типы policy outcome).

6. Risks
- Ложные блокировки при неполной классификации risk.
- Усложнение control flow и риск непокрытых веток error handling.

7. Test plan
- Success: `allow` пропускает действие.
- Failure: `deny` блокирует и завершает шаг корректно.
- Approval path: `requires_approval` переводит выполнение в ожидание.
- Regression: невозможность выполнить мутацию без policy decision.

8. Rollout / migration notes
- Ввести feature flag для мягкого запуска в режиме audit-only перед enforcement.
- После стабилизации — включить enforce режим по умолчанию.

9. Recommendation
Реализовать сразу после контракта policy, поскольку это главный safety-perimeter.
