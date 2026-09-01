# 0202 — Репозиторий каталога проектов (Postgres + in-memory)

**Фаза:** P0 · **Оценка:** M · **Зависит от:** 0201
**Файлы:** `packages/state/src/catalog/project-catalog.store.ts`, `.../postgres-project-catalog.ts`, `.../in-memory-project-catalog.ts`

## Задача
Реализовать порт каталога и два адаптера — по образцу существующей пары
`InMemoryStateStore` / `PostgresStateStore`.

## Контракт
```ts
export interface ProjectCatalogStore {
  createTenant: (tenant: Tenant) => Promise<void>;
  createRepository: (repository: Repository) => Promise<void>;
  createProject: (project: Project, config: ProjectConfig) => Promise<void>;
  updateProjectStatus: (scope: TenantScope, status: ProjectStatus) => Promise<void>;
  getProject: (scope: TenantScope) => Promise<Project | null>;
  listProjects: (query: { tenantId?: string; status?: ProjectStatus }) => Promise<readonly Project[]>;
  getEffectiveConfig: (scope: TenantScope) => Promise<ProjectConfig>;
  putConfigVersion: (scope: TenantScope, config: ProjectConfig, actor: string) => Promise<number>;
}
```

## Критерии приёмки
- [ ] Оба адаптера проходят один общий контрактный набор тестов.
- [ ] Конфиг версионируется: `putConfigVersion` создаёт новую версию, не мутирует старую.
- [ ] Уникальность `(tenant_id, project_id)` обеспечивается БД, а не кодом.

## Тесты
- Контрактный набор, запускаемый против обоих адаптеров (Postgres — опционально по DSN).

## Не входит
- HTTP/CLI-поверхность (0703, 1905).
