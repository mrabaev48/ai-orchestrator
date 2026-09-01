# 0501 — Порт CredentialStore

**Фаза:** P0 · **Оценка:** S · **Зависит от:** 0302
**Файлы:** `packages/state/src/credentials/credential.store.ts`

## Контекст
Сейчас единственный ключ приходит из `LLM_API_KEY` в процесс-глобальном конфиге. Для нескольких
провайдеров и нескольких тенантов этого недостаточно.

## Контракт
```ts
export interface CredentialStore {
  put: (scope: TenantScope, ref: string, value: string) => Promise<void>;
  get: (scope: TenantScope, ref: string) => Promise<string>;      // только в момент запроса
  rotate: (scope: TenantScope, ref: string, value: string) => Promise<void>;
  list: (scope: TenantScope) => Promise<readonly CredentialMetadata[]>;  // без значений
  delete: (scope: TenantScope, ref: string) => Promise<void>;
}
```

## Критерии приёмки
- [ ] `list` никогда не возвращает значение секрета — только метаданные и хеш-отпечаток.
- [ ] Порт не зависит от конкретного шифрования (реализация в 0503).
- [ ] Все возвращённые значения регистрируются в `registerRuntimeSecrets` для редакции в логах.

## Тесты
- Компиляционный + фиктивная реализация в тестах.
