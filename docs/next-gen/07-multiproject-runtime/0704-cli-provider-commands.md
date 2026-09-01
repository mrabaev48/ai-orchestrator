# 0704 — CLI-команды для провайдеров моделей

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0505
**Файлы:** `apps/control-plane/src/cli.ts`

## Задача
`provider add|list|test|refresh-models|disable|remove` — минимальный путь подключения локальной
модели без UI.

## Пример
```bash
pnpm run cli -- provider add --id ollama-local --kind ollama \
  --base-url http://127.0.0.1:11434 --egress-class private
pnpm run cli -- provider test --id ollama-local
```

## Критерии приёмки
- [ ] Секрет вводится через stdin или файл, не через аргумент командной строки (не попадает в history).
- [ ] `provider test` печатает health и список обнаруженных моделей.
- [ ] Вывод не содержит секретов.

## Тесты
- CLI-тест с mock-адаптером; проверка отсутствия секрета в выводе и логах.
