# 1905 — Эндпоинты проектов и репозиториев

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 1901, 0702
**Файлы:** `apps/dashboard-api/src/write/projects.controller.ts`

## Эндпоинты
```
POST   /api/v1/repositories
POST   /api/v1/projects
GET    /api/v1/projects            (фильтры: tenant, status)
GET    /api/v1/projects/{id}
PATCH  /api/v1/projects/{id}       (pause/resume/config)
DELETE /api/v1/projects/{id}       (archive)
```

## Критерии приёмки
- [ ] DTO с `class-validator` в стиле существующих (`dashboard-query.dto.ts`).
- [ ] Ошибки в едином формате через существующий `http-exception.filter.ts`.
- [ ] Все операции проходят RBAC и пишутся в audit log.

## Тесты
- E2E: создание, список, пауза, архивация с активным прогоном → 409.
