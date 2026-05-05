const SECRET_KEY_PATTERN = /(token|secret|password|passwd|authorization|api[-_]?key|private[-_]?key)/i;
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, 
  /\b(?:sk|rk)_[A-Za-z0-9]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

const REDACTED_VALUE = '[REDACTED]';

export interface RedactSecretsOptions {
  readonly redactedValue?: string;
  readonly maxDepth?: number;
}

export function redactSecrets<T>(input: T, options: RedactSecretsOptions = {}): T {
  const redactedValue = options.redactedValue ?? REDACTED_VALUE;
  const maxDepth = options.maxDepth ?? 8;

  const visit = (value: unknown, key: string | null, depth: number): unknown => {
    if (depth > maxDepth) {
      return value;
    }

    if (typeof value === 'string') {
      if (isSecretKey(key) || isSecretLikeValue(value)) {
        return redactedValue;
      }
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => visit(entry, key, depth + 1));
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(record).map(([entryKey, entryValue]) => {
          if (isSecretKey(entryKey)) {
            return [entryKey, redactedValue];
          }
          return [entryKey, visit(entryValue, entryKey, depth + 1)];
        }),
      );
    }

    return value;
  };

  return visit(input, null, 0) as T;
}

function isSecretKey(key: string | null): boolean {
  return key !== null && SECRET_KEY_PATTERN.test(key);
}

function isSecretLikeValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}
