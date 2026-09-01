# 1504 — MCP-клиент: транспорт streamable HTTP

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1501
**Файлы:** `packages/capabilities/src/mcp/http-client.ts`

## Реализация
```ts
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } }));
```

## Объём
- Заголовки авторизации подставляются из `CredentialStore` в момент подключения.
- Таймауты запроса и переподключение при разрыве потока.
- Проверка версии протокола после `connect` (SDK поддерживает согласование версий) и понятная
  ошибка при несовместимости.
- URL проходит проверку egress-политики (2603).

## Критерии приёмки
- [ ] Разрыв соединения не роняет прогон: попытка переподключения, затем деградация.
- [ ] Секреты не попадают в логи и в evidence.

## Тесты
- Интеграция с фикстурным HTTP MCP-сервером; сценарий разрыва.
