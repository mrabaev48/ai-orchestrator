# 0703 — CLI-команды для проектов

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0702
**Файлы:** `apps/control-plane/src/cli.ts`, `apps/control-plane/src/authz/rbac-abac.ts`

## Задача
Добавить `project create|list|show|pause|resume|archive|set-config` и обязательный флаг
`--project` для команд, работающих с состоянием.

## Объём
- Расширить `CommandName` и `RESTRICTED_COMMANDS`.
- Обратная совместимость: если `--project` не указан и в каталоге ровно один проект — использовать его,
  иначе явная ошибка со списком.
- Существующие проверки kill-switch и human-override применяются к новым командам.

## Критерии приёмки
- [ ] `pnpm run show-state -- --project X` работает, `--project` c несуществующим id даёт понятную ошибку.
- [ ] RBAC-матрица покрывает новые команды (тест `tests/rbac-abac-control-plane.test.ts` расширен).
- [ ] `tests/cli.test.ts` зелёный.

## Тесты
- CLI-тесты на каждую новую команду, включая отказ по правам.
