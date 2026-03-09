export interface DecisionLogItem {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  affectedAreas: string[];
  createdAt: string;
}

export function validateDecision(item: DecisionLogItem): string[] {
  const issues: string[] = [];
  if (!item.title.trim()) issues.push('Decision title is required');
  if (!item.decision.trim()) issues.push('Decision body is required');
  if (!item.rationale.trim()) issues.push('Decision rationale is required');
  return issues;
}
