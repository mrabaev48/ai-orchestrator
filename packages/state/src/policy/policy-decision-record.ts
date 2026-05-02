import { z } from 'zod';
import { policyOutcomeSchema, type PolicyOutcome } from '../../../core/src/policy/policy-outcome.ts';

export interface PolicyDecisionRecord {
  decisionId: string;
  runId: string;
  stepId: string;
  decidedAt: string;
  outcome: PolicyOutcome;
}

export const policyDecisionRecordSchema = z.object({
  decisionId: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  decidedAt: z.iso.datetime({ offset: true }),
  outcome: policyOutcomeSchema,
});

export function validatePolicyDecisionRecord(record: PolicyDecisionRecord): string[] {
  const parsed = policyDecisionRecordSchema.safeParse(record);
  if (parsed.success) {
    return [];
  }

  return parsed.error.issues.map((issue) => {
    const path = issue.path.length === 0 ? 'policyDecisionRecord' : issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
}
