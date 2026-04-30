1. Feature summary
Добавить persisted append-only `RunStepEvidence` с checksum verification и correlation IDs.

2. Relevant modules
- `packages/state` (evidence storage).
- `packages/execution` (emission evidence на каждом шаге).
- `packages/application`/`apps/*` (read-model/API выдача).

3. Existing behavior
Целевой evidence trail определен в spec, но может отсутствовать полная и неизменяемая фиксация всех step-attempt событий.

4. Proposed design
- Реализовать append-only store для `RunStepEvidence`.
- Генерировать checksum при записи, проверять при чтении.
- Привязать `policyDecisions`, `approvals`, `toolCalls`, `validations` к единому evidence record.
- Добавить индексы по `tenantId/projectId/runId/stepId`.

5. Files likely to change
- `packages/state/**` (storage ports/impl).
- `packages/execution/**` (evidence emission).
- `apps/**` (query/read-model при необходимости).

6. Risks
- Рост нагрузки на storage и размеры событий.
- Риск потери целостности при неполной транзакционности записи.

7. Test plan
- Unit: append-only поведение (no update/no delete).
- Unit: checksum mismatch детектируется.
- Integration: полный trace одного run доступен для реконструкции.

8. Rollout / migration notes
- Добавить backfill-стратегию: legacy runs без полного evidence помечать как partial.
- Ввести retention policy без нарушения audit-требований.

9. Recommendation
Приоритетно для операционной поддержки и incident forensics.
