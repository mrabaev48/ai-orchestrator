1. Feature summary
Унифицировать typed tool contracts: strict input/output schema + normalized error envelope + determinism metadata.

2. Relevant modules
- `packages/tools` (адаптеры и контракты).
- `packages/execution` (потребление нормализованных результатов).
- `packages/core` (ошибки и классификаторы retriable).

3. Existing behavior
Разные tools могут возвращать неоднородные структуры и ошибки, что повышает риск branch-specific логики и слабой диагностики.

4. Proposed design
- Для каждого tool адаптера ввести явные schema validator-ы входа/выхода.
- Ввести общий `ToolErrorEnvelope` (`category`, `retriable`, `code`, `details`).
- Добавить `determinism` и `risk` metadata в tool descriptor.
- Запретить проброс raw provider errors в orchestration слой.

5. Files likely to change
- `packages/tools/**` (контракты и адаптеры).
- `packages/execution/**` (normalization pipeline).
- `packages/tools/**/*.test.ts`.

6. Risks
- Временное увеличение объема адаптерного кода.
- Возможные breaking эффекты для внутренних вызовов без миграционного слоя.

7. Test plan
- Unit: schema reject на невалидный input/output.
- Unit: mapping provider error -> normalized envelope.
- Integration: orchestration корректно обрабатывает retriable/non-retriable.

8. Rollout / migration notes
- Внедрять поэтапно по инструментам, начиная с критичных для mutation pipeline.
- На переходе логировать dual-format для сверки.

9. Recommendation
Ключевая задача для debuggability и стабильных retry-решений.
