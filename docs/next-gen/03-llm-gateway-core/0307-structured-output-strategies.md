# 0307 — Стратегии structured output и их деградация

**Фаза:** P0 · **Оценка:** L · **Зависит от:** 0302
**Файлы:** `packages/llm/src/structured/strategy.ts`

## Контекст
Локальные модели редко поддерживают нативные JSON-схемы так же, как облачные. Без деградации
локальный сценарий (ключевое требование) окажется нерабочим.

## Задача
Реализовать выбор стратегии по `ModelCapabilities.structuredOutput` и единый разбор результата.

## Стратегии
1. `native_schema` — OpenAI Responses `text.format = {type:'json_schema', name, schema, strict:true}`;
   Anthropic — строгие tool-схемы; Ollama — поле `format` с JSON Schema;
   vLLM — `response_format: {type:'json_schema', json_schema:{name, schema}}`.
2. `tool_call` — схема подаётся как единственный инструмент с `tool_choice` на него;
   ответ берётся из аргументов вызова.
3. `grammar` — llama.cpp GBNF / vLLM `extra_body.structured_outputs.grammar`
   (важно: `guided_json`/`guided_grammar` объявлены устаревшими и удалены в vLLM 0.12).
4. `json_mode` / `none` — свободный JSON + строгая валидация + repair-проход (0308).

## Ограничения схемы для strict-режимов
- Все поля в `required`, `additionalProperties: false` — иначе провайдер отклонит схему.
- Добавить `assertStrictSchemaCompatible(schema)` с понятной ошибкой при нарушении.

## Критерии приёмки
- [ ] Для каждой стратегии есть адаптерная реализация и тест на фикстуре.
- [ ] Выбор стратегии логируется и попадает в метрику (для анализа качества по моделям).
- [ ] Отказ модели (`refusal` у OpenAI) распознаётся как `finishReason: 'refusal'`, а не как схема-ошибка.

## Тесты
- Матрица «модель × стратегия»: валидный ответ, невалидный, отказ, обрезка по длине.
