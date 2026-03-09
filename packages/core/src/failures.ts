import type { AgentRoleName } from './roles.ts';

export interface FailureRecord {
  id: string;
  taskId: string;
  role: AgentRoleName;
  reason: string;
  symptoms: string[];
  badPatterns: string[];
  retrySuggested: boolean;
  createdAt: string;
}

export function toRetryConstraints(failures: FailureRecord[]): string[] {
  return failures.flatMap((failure) => [
    `Avoid repeat of failure reason: ${failure.reason}`,
    ...failure.badPatterns.map((pattern) => `Do not repeat bad pattern: ${pattern}`),
  ]);
}
