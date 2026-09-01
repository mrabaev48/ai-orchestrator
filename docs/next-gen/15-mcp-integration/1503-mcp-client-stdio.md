# 1503 — MCP-клиент: транспорт stdio

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1501
**Файлы:** `packages/capabilities/src/mcp/stdio-client.ts` (новый пакет)

## Реализация
Установленная версия SDK — 1.29.0, импорты подпутями:
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'ai-orchestrator', version: '1.0.0' });
await client.connect(new StdioClientTransport({ command, args, env, cwd }));
try { /* listTools / callTool */ } finally { await client.close(); }
```

## Объём
- `close()` обязателен в `finally` — иначе дочерний процесс остаётся жить.
- Окружение дочернего процесса формируется явно: только переменные из `credentialRefs`
  и минимальный PATH, без наследования всего `process.env`
  (аналогично подходу `packages/execution/src/git/git-subprocess-env.ts`).
- Таймаут старта; принудительное убийство дерева процессов при отмене.
- Ограничение объёма вывода сервера в логах.

## Критерии приёмки
- [ ] После завершения прогона не остаётся осиротевших процессов (проверяется тестом).
- [ ] Отмена через `AbortSignal` убивает процесс в пределах таймаута.
- [ ] Ошибки соединения нормализуются в `ToolErrorEnvelope`.

## Тесты
- Интеграция с фикстурным MCP-сервером (1510): подключение, вызов, отмена, аварийное завершение.
