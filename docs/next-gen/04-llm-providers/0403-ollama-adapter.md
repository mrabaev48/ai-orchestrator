# 0403 — Нативный адаптер Ollama

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0304, 0307
**Файлы:** `packages/llm/src/adapters/ollama.ts`

## Задача
Отдельный адаптер под главный локальный сценарий: дискавери моделей, JSON-схемы, keep_alive.

## Объём
- `POST {baseUrl}/api/chat`: `model`, `messages`, `tools`, `format` (строка `json` либо JSON Schema),
  `options` (temperature, num_ctx и др.), `stream: false`, `keep_alive`.
- Ответ: `message.content`, `message.tool_calls`, `done`, `done_reason`,
  `prompt_eval_count` → inputTokens, `eval_count` → outputTokens (`estimated: false`),
  длительности (`total_duration`, `eval_duration`) → в метрики латентности.
- Дискавери: `GET /api/tags` (список моделей), `POST /api/show` (детали, размер контекста)
  → заполнение `ModelDescriptor.contextWindow`.
- `keep_alive` конфигурируем на провайдере — иначе первый запрос после простоя даёт долгий прогрев.

## Документация
- Ollama API `/api/chat`: поля `model`, `messages`, `tools`, `format`, `options`, `stream`,
  `keep_alive`, `think`; ответ содержит `message.tool_calls`, `done_reason`,
  `prompt_eval_count`, `eval_count`.

## Критерии приёмки
- [ ] Модель без поддержки инструментов не получает поле `tools` (иначе часть моделей ломается).
- [ ] `contextWindow` заполняется из `/api/show`, а не хардкодом.
- [ ] Стоимость локальной модели = 0 по умолчанию, но поле цены доступно (для расчёта себестоимости GPU).

## Тесты
- Фикстуры `/api/tags`, `/api/show`, `/api/chat` (с tool_calls и с `format`-схемой).
- Опциональный e2e против локального Ollama, пропускается без `OLLAMA_TEST_URL`.
