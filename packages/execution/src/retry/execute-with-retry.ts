import { getRetrySchedule, type RetryPolicy } from '../../../core/src/retry/retry-policy.ts';
import { propagateAbort } from '../cancellation/propagate-abort.ts';

export interface RetryFailure {
  code: string;
  message: string;
  retriable: boolean;
}

export interface RetryExecutionResult<TSuccess> {
  ok: boolean;
  value?: TSuccess;
  failure?: RetryFailure;
}

export interface RetryAttemptContext {
  attempt: number;
  signal: AbortSignal;
}

export interface ExecuteWithRetryInput<TSuccess> {
  policy?: Partial<RetryPolicy>;
  execute: (context: RetryAttemptContext) => Promise<RetryExecutionResult<TSuccess>>;
  signal?: AbortSignal;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
}

export async function executeWithRetry<TSuccess>(
  input: ExecuteWithRetryInput<TSuccess>,
): Promise<RetryExecutionResult<TSuccess>> {
  const sleep = input.sleep ?? defaultSleep;
  const random = input.random ?? Math.random;
  const parentSignal = input.signal;

  let attempt = 1;
  while (true) {
    if (parentSignal?.aborted) {
      return { ok: false, failure: { code: 'RETRY_CANCELLED', message: 'retry cancelled before attempt', retriable: false } };
    }

    const currentAttempt = attempt;
    const attemptSignal = propagateAbort(parentSignal);
    let result: RetryExecutionResult<TSuccess>;
    try {
      result = await input.execute({ attempt: currentAttempt, signal: attemptSignal.signal });
    } finally {
      attemptSignal.dispose();
    }
    if (result.ok) {
      return result;
    }
    if (!result.failure?.retriable) {
      return result;
    }

    const schedule = getRetrySchedule({ attempt }, input.policy, random);
    if (!schedule.shouldRetry) {
      return result;
    }

    try {
      const sleepSignal = propagateAbort(parentSignal);
      try {
        await sleep(schedule.delayMs, sleepSignal.signal);
      } finally {
        sleepSignal.dispose();
      }
    } catch {
      return { ok: false, failure: { code: 'RETRY_CANCELLED', message: 'retry cancelled during backoff', retriable: false } };
    }
    attempt += 1;
  }
}

async function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('sleep_aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
