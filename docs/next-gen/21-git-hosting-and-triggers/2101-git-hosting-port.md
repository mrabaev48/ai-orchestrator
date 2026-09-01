# 2101 — Порт git-хостинга

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 0101
**Файлы:** `packages/tools/src/hosting/hosting-port.ts`

## Контекст
Мутационный конвейер доводит работу до подготовки PR-бандла
(`packages/execution/src/mutation/stages/pr-draft-prepare.ts`), но реального PR не создаёт.

## Контракт
```ts
export interface GitHostingPort {
  createPullRequest: (input: CreatePrInput) => Promise<PullRequestRef>;
  updatePullRequest: (ref: PullRequestRef, patch: UpdatePrInput) => Promise<void>;
  commentOnPullRequest: (ref: PullRequestRef, body: string) => Promise<void>;
  getPullRequestStatus: (ref: PullRequestRef) => Promise<PullRequestStatus>;
  listChecks: (ref: PullRequestRef) => Promise<readonly CheckRun[]>;
}
```

## Критерии приёмки
- [ ] Порт провайдеро-независим; ошибки нормализуются в `ToolErrorEnvelope`.
- [ ] Создание PR — side-effect с идемпотентным ключом и approval-гейтом (механики уже есть).

## Тесты
- Компиляционные + фиктивная реализация.
