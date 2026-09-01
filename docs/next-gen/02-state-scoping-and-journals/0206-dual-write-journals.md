# 0206 — Двойная запись журналов (снимок + таблицы)

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0204, 0205
**Файлы:** `packages/state/src/*`, `packages/shared/src/config/instance-config.ts`

## Контекст
`ProjectState` содержит растущие массивы `runStepLog`, `artifacts`, `policyDecisions`,
`approvals`, `failures`, `decisions` (`packages/core/src/project-state.ts:92-110`). Убирать их
сразу нельзя — на форме снимка завязаны инварианты и read-модели.

## Задача
Ввести режим `STATE_JOURNALS_MODE=snapshot|dual|table` и реализовать `dual`: запись идёт и в
снимок, и в журнальную таблицу.

## Критерии приёмки
- [ ] В режиме `dual` данные в снимке и в таблице совпадают (проверяется тестом-сверкой).
- [ ] Режим `snapshot` полностью повторяет текущее поведение (дефолт на время миграции).
- [ ] Цепочка checksum в `run_step_log` не ломается (`packages/core/src/evidence/run-step-evidence.ts`).

## Тесты
- Интеграция: 100 шагов в режиме `dual`, сверка снимка и таблицы, проверка checksum-цепочки.

## Не входит
- Переключение читателей (0207).
