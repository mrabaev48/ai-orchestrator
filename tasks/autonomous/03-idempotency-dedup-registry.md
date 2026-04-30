1. Feature summary
Реализовать idempotency/dedup для внешних side-effects (tool calls, push, PR create), чтобы исключить дубли при retry/replay.

2. Relevant modules
- `packages/execution` (retry/replay semantics).
- `packages/state` (хранилище dedup ключей).
- `packages/tools` (прокидывание idempotency metadata).

3. Existing behavior
В spec задан формат idempotency key, но нет гарантии системного применения и strongly-consistent dedup на worker scope.

4. Proposed design
- Ввести единый генератор ключа: `{tenant}:{project}:{run}:{task}:{stage}:{attempt}:{actionHash}`.
- Добавить dedup registry с atomic check-and-set.
- Для non-idempotent операций (`push`, `pr_draft`) блокировать повторное выполнение по ключу.
- Явно маркировать retriable/non-retriable ветки.

5. Files likely to change
- `packages/execution/**` (обвязка stage/action idempotency).
- `packages/state/**` (порт + реализация dedup registry).
- `packages/tools/**` (метаданные операции).

6. Risks
- Race condition при неатомарной реализации dedup.
- Ложные dedup-hit при слишком грубом actionHash.

7. Test plan
- Unit: стабильная генерация ключа.
- Unit: duplicate suppress для non-idempotent операций.
- Integration: retry не создает второй push/PR.
- Concurrency: два worker не выполняют один side-effect дважды.

8. Rollout / migration notes
- Добавить совместимый no-op fallback только для dev-mode.
- В prod окружении требовать persistent dedup store.

9. Recommendation
Критично сделать до масштабирования retry/recovery, иначе высок риск дублей внешних эффектов.
