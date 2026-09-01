# 0101 — Доменные типы Tenant / Project / Repository

**Фаза:** P0 · **Оценка:** S · **Зависит от:** —
**Файлы:** `packages/core/src/tenancy.ts` (новый), `packages/core/src/index.ts`

## Контекст
Сейчас проект существует только как поля `orgId`/`projectId` внутри `ProjectState`
(`packages/core/src/project-state.ts:92`), а сам проект задаётся при создании рантайма
(`packages/runtime/src/index.ts:57`). Реестра проектов нет, поэтому один процесс = один проект.

## Задача
Ввести доменные сущности `Tenant`, `Project`, `Repository` и их zod-схемы. Только типы и валидация,
без персистентности и без изменения поведения.

## Объём
- `Tenant`: `tenantId`, `name`, `status: 'active' | 'suspended'`, `createdAt`.
- `Project`: `tenantId`, `projectId`, `name`, `repositoryId`, `autonomyLevel` (переиспользовать
  `packages/core/src/autonomy/autonomy-level.ts`), `configVersion`, `status`, `createdAt`.
- `Repository`: `repositoryId`, `tenantId`, `provider: 'github' | 'gitlab' | 'bitbucket' | 'local'`,
  `remoteUrl`, `defaultBranch`, `credentialRef?`, `protectedPaths`, `verification.commands`.
- zod-схемы + `assertProject` / `assertRepository` в стиле `assertProjectState`.
- Экспорт из `packages/core/src/index.ts`.

## Критерии приёмки
- [ ] Типы и схемы экспортируются из `@ai-orchestrator/core`.
- [ ] `projectId`/`tenantId` валидируются теми же правилами, что `TenantScope`
      (`packages/core/src/multitenancy-tenant-scope.ts`) — без `:` в идентификаторах.
- [ ] `pnpm run typecheck` и `pnpm run boundaries` зелёные.
- [ ] Поведение рантайма не изменилось (новые типы никем не используются).

## Тесты
- Юнит: валидные/невалидные значения, отказ на пустой `projectId`, отказ на `:` в идентификаторе.

## Не входит
- Таблицы БД (0201), сервисы (0702), API (1905).
