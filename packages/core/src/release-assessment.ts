export type ReleaseVerdict = 'ready' | 'caution' | 'blocked';

export interface ReleaseAssessment {
  verdict: ReleaseVerdict;
  confidence: number;
  blockers: string[];
  warnings: string[];
  evidence: string[];
  recommendedNextActions: string[];
}

export function validateReleaseAssessment(assessment: ReleaseAssessment): string[] {
  const issues: string[] = [];

  if (assessment.confidence < 0 || assessment.confidence > 1) {
    issues.push('Release assessment confidence must be between 0 and 1');
  }

  if (assessment.evidence.length === 0) {
    issues.push('Release assessment must include evidence');
  }

  return issues;
}
