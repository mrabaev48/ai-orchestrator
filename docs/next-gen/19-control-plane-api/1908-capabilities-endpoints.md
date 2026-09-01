# 1908 — Эндпоинты MCP / skills / rules

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 1901, 1501, 1701, 1801
**Файлы:** `apps/dashboard-api/src/write/capabilities.controller.ts`

## Эндпоинты
```
POST/GET/PATCH/DELETE  /api/v1/mcp-servers[/{id}]
POST   /api/v1/mcp-servers/{id}/test      подключение + список инструментов
POST/GET/PATCH/DELETE  /api/v1/skills[/{id}]
POST/GET/PATCH/DELETE  /api/v1/rules[/{id}]
POST   /api/v1/rules/{id}/simulate        применить правило к прошлому прогону
```

## Критерии приёмки
- [ ] `mcp-servers/{id}/test` не оставляет запущенных процессов.
- [ ] `rules/{id}/simulate` показывает, что бы правило заблокировало, не меняя состояния.
- [ ] Секреты MCP передаются только через `credentialRefs`.

## Тесты
- E2E с фикстурным MCP-сервером (1510); симуляция правила на записанном прогоне.
