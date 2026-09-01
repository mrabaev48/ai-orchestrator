# 0407 — Mock-провайдер и общий набор фикстур

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0304
**Файлы:** `packages/llm/src/adapters/mock.ts`, `packages/llm/src/testing/fixtures/`

## Задача
Заменить текущий `MockLlmClient` (очередь объектов) на полноценный mock-адаптер, реализующий
порт: usage, finishReason, tool_calls, программируемые ошибки.

## Критерии приёмки
- [ ] Mock умеет: вернуть ответ, вернуть tool_call, вернуть невалидный JSON, бросить ошибку заданного kind.
- [ ] Существующие тесты, использующие `MockLlmClient`, переведены без потери покрытия.
- [ ] `LLM_PROVIDER=mock` продолжает работать для локального запуска (README-сценарий).

## Тесты
- Самотест mock-адаптера + прогон `pnpm run bootstrap && pnpm run run-cycle` в mock-режиме.
