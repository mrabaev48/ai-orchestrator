# 1907 — Эндпоинты агентов

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 1901, 1604, 1611
**Файлы:** `apps/dashboard-api/src/write/agents.controller.ts`

## Эндпоинты
```
POST   /api/v1/agents                 создать draft
PUT    /api/v1/agents/{id}            изменить draft
POST   /api/v1/agents/{id}/validate   отчёт валидации без публикации
POST   /api/v1/agents/{id}/publish    публикация версии
POST   /api/v1/agents/{id}/dry-run    прогон на фикстуре
GET    /api/v1/agents/{id}/versions
DELETE /api/v1/agents/{id}            deprecate
POST   /api/v1/projects/{pid}/agents  назначение агента роли проекта
```

## Критерии приёмки
- [ ] Публикация без успешной валидации невозможна.
- [ ] Ответ `validate` содержит все проблемы разом, машиночитаемо.
- [ ] Dry-run асинхронный: возвращает id, результат забирается отдельным запросом.

## Тесты
- E2E: создание → валидация с ошибкой → исправление → публикация → назначение.
