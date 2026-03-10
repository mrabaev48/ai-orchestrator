export type IntegritySeverity = 'low' | 'medium' | 'high';

export interface StateIntegrityFinding {
  issue: string;
  severity: IntegritySeverity;
  repairRecommendation: string;
  safeToAutoRepair: boolean;
}

export interface StateIntegrityAssessment {
  ok: boolean;
  findings: StateIntegrityFinding[];
  summary: string;
}

export function validateStateIntegrityAssessment(
  assessment: StateIntegrityAssessment,
): string[] {
  const issues: string[] = [];

  if (!assessment.summary.trim()) {
    issues.push('State integrity assessment summary is required');
  }

  return issues;
}
