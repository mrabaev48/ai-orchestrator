# 1602 — Схема AgentDefinition

**Фаза:** P2 · **Оценка:** M · **Зависит от:** 1601, 0103
**Файлы:** `packages/core/src/agents/agent-definition.ts`

## Контракт (ключевые секции)
```ts
export interface AgentDefinition {
  readonly agentId: string; readonly version: number; readonly tenantId: string;
  readonly name: string; readonly description: string;
  readonly roleKey: RoleKey; readonly kind: 'builtin' | 'custom';
  readonly status: 'draft' | 'published' | 'deprecated';
  readonly instructions: { readonly system: string; readonly objectiveTemplate: string;
                           readonly acceptanceCriteria: readonly string[] };
  readonly output: { readonly schemaName: string; readonly jsonSchema: Record<string, unknown> };
  readonly capabilities: { readonly tools: readonly ToolBinding[]; readonly mcpServers: readonly string[];
                           readonly skills: readonly string[]; readonly rules: readonly string[] };
  readonly model: { readonly routingRuleId?: string; readonly preferred?: readonly string[];
                    readonly temperature?: number; readonly maxOutputTokens?: number };
  readonly limits: { readonly maxSteps: number; readonly maxWallTimeMs: number;
                     readonly tokenBudget?: number; readonly costBudgetUsdMicro?: number };
  readonly policy: { readonly writeMode: SafeWriteMode;
                     readonly approvalRequiredActions: readonly ApprovalRequestedAction[];
                     readonly autonomyCeiling: AutonomyLevel };
  readonly createdAt: string; readonly createdBy: string;
}
```

## Критерии приёмки
- [ ] Строгая zod-схема; неизвестные поля отклоняются.
- [ ] Плейсхолдеры в `instructions` валидируются по белому списку (нет произвольной подстановки).
- [ ] Экспорт YAML↔JSON для хранения определений в git.

## Тесты
- Юнит: валидные/невалидные определения; неизвестный плейсхолдер; неизвестный roleKey.
