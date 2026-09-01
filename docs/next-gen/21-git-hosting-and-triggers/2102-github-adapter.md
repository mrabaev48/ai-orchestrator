# 2102 — Адаптер GitHub

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 2101, 0503
**Файлы:** `packages/tools/src/hosting/github.ts`

## Объём
- `POST /repos/{owner}/{repo}/pulls` (создание, поддержка `draft: true`),
  `PATCH /repos/{owner}/{repo}/pulls/{n}`, `POST .../issues/{n}/comments`,
  `GET .../commits/{sha}/check-runs`.
- Аутентификация: token из `CredentialStore`; поддержка GitHub App (installation token) как опция.
- Обработка rate limit: заголовки `x-ratelimit-*`, `Retry-After` → ретраи по таксономии 0303.

## Критерии приёмки
- [ ] Повторный вызов с тем же ключом идемпотентности не создаёт второй PR
      (проверка существующего PR по ветке перед созданием).
- [ ] Создание PR требует approval, если это указано в политике проекта (дефолт — да).
- [ ] Токен не попадает в логи, evidence и сообщения об ошибках.

## Тесты
- Юнит на фикстурах API; интеграция против фиктивного HTTP-сервера; сценарий rate limit.
