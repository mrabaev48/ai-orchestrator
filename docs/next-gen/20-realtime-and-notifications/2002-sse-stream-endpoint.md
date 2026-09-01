# 2002 — SSE-поток прогона

**Фаза:** P3 · **Оценка:** M · **Зависит от:** 2001, 1902
**Файлы:** `apps/dashboard-api/src/realtime/run-stream.controller.ts`

## Реализация (NestJS)
```ts
@Sse('runs/:runId/events')
stream(@Param('runId') runId: string): Observable<MessageEvent> {
  return this.bus.observe(runId).pipe(map((event) => ({ data: event, type: event.type, id: event.id })));
}
```
`MessageEvent` в NestJS: `data` (обязательно), `id`, `type`, `retry`. Клиент — стандартный
`EventSource`; для очистки ресурсов при разрыве использовать сигнал жизненного цикла ответа.

## Критерии приёмки
- [ ] Отключение клиента освобождает подписку (нет утечки слушателей — тест на 100 подключений).
- [ ] Авторизация применяется к SSE так же, как к обычным эндпоинтам.
- [ ] Переподключение с `Last-Event-ID` продолжает поток без дублей.

## Тесты
- E2E: подписка, получение событий прогона, разрыв и переподключение.
