# 1202 — ToolDescriptor и реестр инструментов

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1201
**Файлы:** `packages/tools/src/registry/tool-registry.ts`

## Контракт
```ts
export interface ToolDescriptor {
  readonly toolName: string;                    // 'file_write' | 'mcp:github:create_issue'
  readonly source: 'local' | 'mcp' | 'http';
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema?: Record<string, unknown>;
  readonly determinism: ToolDeterminismMetadata;      // контракт уже существует
  readonly riskClass: 'read' | 'write_workspace' | 'write_external' | 'destructive';
  readonly requiresApproval: boolean;
  readonly timeoutMs: number;
}
export interface ToolRegistry {
  list: (scope: TenantScope, bindings: readonly ToolBinding[]) => readonly ToolDescriptor[];
  execute: (req: UnifiedToolRequest, opts: ToolExecutionOptions) => Promise<UnifiedToolResult>;
}
```

## Критерии приёмки
- [ ] `UnifiedToolRequest/Result` и нормализация ошибок переиспользуются как есть
      (`packages/tools/src/contracts.ts`, `errors/tool-error-envelope.ts`).
- [ ] Реестр не знает про MCP — источники подключаются как провайдеры инструментов.
- [ ] Таймаут применяется через существующий `withToolTimeout`.

## Тесты
- Юнит: регистрация локальных адаптеров; неизвестный инструмент; таймаут.
