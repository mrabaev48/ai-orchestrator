# 1501 — Контракт регистрации MCP-сервера

**Фаза:** P2 · **Оценка:** S · **Зависит от:** 1202
**Файлы:** `packages/core/src/capabilities/mcp.ts`

## Контекст
`@modelcontextprotocol/sdk` объявлен в зависимостях корня (установлена версия 1.29.0), но
использований в коде нет — функциональности MCP сегодня не существует.

## Контракт
```ts
export interface McpServerRegistration {
  readonly serverId: string; readonly tenantId: string;
  readonly scope: 'instance' | 'project';
  readonly transport:
    | { readonly kind: 'stdio'; readonly command: string; readonly args: readonly string[];
        readonly env?: Readonly<Record<string, string>>; readonly cwd?: string }
    | { readonly kind: 'http'; readonly url: string;
        readonly headers?: Readonly<Record<string, string>> };
  readonly credentialRefs: readonly string[];
  readonly allowedTools?: readonly string[];
  readonly riskOverrides?: Readonly<Record<string, ToolRiskClass>>;
  readonly startupTimeoutMs: number; readonly callTimeoutMs: number;
  readonly enabled: boolean;
}
```

## Критерии приёмки
- [ ] Схема zod; `stdio` требует команду, `http` — валидный URL.
- [ ] Секреты только через `credentialRefs`, не в `env`/`headers` открытым текстом.

## Тесты
- Юнит на валидацию обеих транспортных форм.
