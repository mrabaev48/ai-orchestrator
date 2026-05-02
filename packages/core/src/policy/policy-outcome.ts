import { z } from 'zod';

export const policyOutcomeTypes = ['allow', 'deny', 'requires_approval', 'defer'] as const;
export type PolicyOutcomeType = (typeof policyOutcomeTypes)[number];

export interface PolicyOutcome {
  outcome: PolicyOutcomeType;
  reasonCodes: string[];
  rationale: string;
}

export const policyOutcomeSchema = z.object({
  outcome: z.enum(policyOutcomeTypes),
  reasonCodes: z.array(z.string().min(1)),
  rationale: z.string().min(1),
}).superRefine((value, ctx) => {
  if (value.outcome === 'allow' && value.reasonCodes.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['reasonCodes'],
      message: 'reasonCodes must be empty for allow outcome',
    });
  }

  if (value.outcome !== 'allow' && value.reasonCodes.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['reasonCodes'],
      message: 'reasonCodes must include at least one code when outcome is non-allow',
    });
  }
});

export function validatePolicyOutcome(outcome: PolicyOutcome): string[] {
  const parsed = policyOutcomeSchema.safeParse(outcome);
  if (parsed.success) {
    return [];
  }

  return parsed.error.issues.map((issue) => {
    const path = issue.path.length === 0 ? 'policyOutcome' : issue.path.join('.');
    return `${path}: ${issue.message}`;
  });
}
