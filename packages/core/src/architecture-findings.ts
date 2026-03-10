export type ArchitectureIssueType =
  | 'cyclic_dependency'
  | 'layering_violation'
  | 'leaky_abstraction'
  | 'overcoupling'
  | 'contract_instability'
  | 'critical_path_gap';

export type ArchitectureSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ArchitectureFinding {
  subsystem: string;
  issueType: ArchitectureIssueType;
  description: string;
  impact: string;
  recommendation: string;
  affectedModules: string[];
  severity: ArchitectureSeverity;
}

export interface ArchitectureAnalysis {
  findings: ArchitectureFinding[];
  riskSummary: string;
}

export function validateArchitectureFinding(finding: ArchitectureFinding): string[] {
  const issues: string[] = [];

  if (!finding.subsystem.trim()) {
    issues.push('Architecture finding subsystem is required');
  }

  if (!finding.description.trim()) {
    issues.push('Architecture finding description is required');
  }

  if (!finding.impact.trim()) {
    issues.push('Architecture finding impact is required');
  }

  if (!finding.recommendation.trim()) {
    issues.push('Architecture finding recommendation is required');
  }

  if (finding.affectedModules.length === 0) {
    issues.push('Architecture finding must reference affected modules');
  }

  return issues;
}
