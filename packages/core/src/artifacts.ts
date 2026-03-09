export type ArtifactType =
  | 'optimized_prompt'
  | 'run_summary'
  | 'backlog_export'
  | 'plan'
  | 'test_plan'
  | 'report';

export interface ArtifactRecord {
  id: string;
  type: ArtifactType;
  title: string;
  location?: string;
  metadata: Record<string, string>;
  createdAt: string;
}

export function validateArtifact(artifact: ArtifactRecord): string[] {
  const issues: string[] = [];
  if (!artifact.title.trim()) issues.push('Artifact title is required');
  if (Object.values(artifact.metadata).some((value) => /key|token|secret/i.test(value))) {
    issues.push('Artifact metadata must not contain secret-like values');
  }
  return issues;
}
