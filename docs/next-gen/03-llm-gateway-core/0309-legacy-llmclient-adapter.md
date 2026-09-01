# 0309 — Совместимость: LlmClient поверх Gateway

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0304, 0307
**Файлы:** `packages/llm/src/compat/legacy-client.ts`

## Задача
Сохранить существующий интерфейс `LlmClient.generateObject`, реализовав его как тонкую обёртку
над `gateway.chat()`. Роли (`ProductionCoderRole`, `ProductionReviewerRole`) не меняются.

## Критерии приёмки
- [ ] `createLlmClient(...)` продолжает работать с прежней сигнатурой (deprecated-пометка).
- [ ] `packages/runtime/src/index.ts` собирается без изменений.
- [ ] `tests/*-role.test.ts` и `packages/llm/src/index.test.ts` зелёные.

## Тесты
- Регрессия: существующие тесты LLM-клиента проходят на новой реализации.

## Не входит
- Перевод ролей на сообщения (группа 12).
