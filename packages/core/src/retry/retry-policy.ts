export interface RetryPolicyInput {
  attempt: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterRatio: number;
}

export interface RetrySchedule {
  shouldRetry: boolean;
  delayMs: number;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 5_000,
  backoffMultiplier: 2,
  jitterRatio: 0.2,
};

export function resolveRetryPolicy(policy?: Partial<RetryPolicy>): RetryPolicy {
  const resolved: RetryPolicy = {
    ...DEFAULT_RETRY_POLICY,
    ...policy,
  };

  if (!Number.isInteger(resolved.maxAttempts) || resolved.maxAttempts < 1) {
    throw new Error('RetryPolicy: maxAttempts must be an integer >= 1');
  }
  if (resolved.baseDelayMs < 0) {
    throw new Error('RetryPolicy: baseDelayMs must be >= 0');
  }
  if (resolved.maxDelayMs < resolved.baseDelayMs) {
    throw new Error('RetryPolicy: maxDelayMs must be >= baseDelayMs');
  }
  if (resolved.backoffMultiplier < 1) {
    throw new Error('RetryPolicy: backoffMultiplier must be >= 1');
  }
  if (resolved.jitterRatio < 0 || resolved.jitterRatio > 1) {
    throw new Error('RetryPolicy: jitterRatio must be between 0 and 1');
  }

  return resolved;
}

export function getRetrySchedule(
  input: RetryPolicyInput,
  policy?: Partial<RetryPolicy>,
  random: () => number = Math.random,
): RetrySchedule {
  const resolvedPolicy = resolveRetryPolicy(policy);

  if (!Number.isInteger(input.attempt) || input.attempt < 1) {
    throw new Error('RetryPolicy: attempt must be an integer >= 1');
  }

  if (input.attempt >= resolvedPolicy.maxAttempts) {
    return { shouldRetry: false, delayMs: 0 };
  }

  const exponentialDelay = Math.min(
    resolvedPolicy.maxDelayMs,
    resolvedPolicy.baseDelayMs * resolvedPolicy.backoffMultiplier ** (input.attempt - 1),
  );

  const jitterAmplitude = exponentialDelay * resolvedPolicy.jitterRatio;
  const jitterOffset = (random() * 2 - 1) * jitterAmplitude;
  const delayMs = Math.max(0, Math.round(exponentialDelay + jitterOffset));

  return {
    shouldRetry: true,
    delayMs,
  };
}
