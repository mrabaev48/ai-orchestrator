# 0207 — Перевод читателей на журнальные таблицы

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0206
**Файлы:** `packages/application/src/read-models.ts`, `packages/application/src/dashboard-query-service.ts`

## Задача
Перевести все read-модели и сервисы на чтение журналов из таблиц (`listRunSteps`, `listEvents`,
новые `listArtifacts`, `listDecisions`, `listFailures`, `listPolicyDecisions`) вместо полей снимка.

## Объём
- Пагинация и фильтры для каждого журнала.
- Проверить потребителей: `dashboard-query-service`, `release-readiness-service`,
  `state-integrity-service`, `integration-export-service`.
- Режим `table` становится дефолтным после того, как все читатели переведены.

## Критерии приёмки
- [ ] Ответы Dashboard API побайтово совпадают с текущими на одинаковых данных.
- [ ] `tests/read-models.test.ts`, `tests/dashboard-api.e2e.test.ts` зелёные.
- [ ] Ни один сервис не обращается к `state.execution.runStepLog` напрямую (проверка грепом в CI).

## Тесты
- Регрессия ответов API до/после переключения режима.

## Не входит
- Удаление полей из снимка (2401).
