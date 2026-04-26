import { validateArtifact, type ArtifactRecord, type ArtifactType } from './artifacts.ts';

type ArtifactValidator = (artifact: ArtifactRecord) => string[];

const ARTIFACT_VALIDATORS: Record<ArtifactType, ArtifactValidator> = {
  bootstrap_analysis: (artifact) => requireMetadata(artifact, ['promptId', 'recommendedNextStep']),
  architecture_analysis: (artifact) => requireMetadata(artifact, ['promptId', 'findings']),
  documentation: (artifact) => requireMetadata(artifact, ['promptId']),
  release_assessment: (artifact) => requireMetadata(artifact, ['promptId', 'verdict']),
  state_integrity_report: (artifact) => requireMetadata(artifact, ['promptId', 'ok']),
  integration_export: (artifact) => requireMetadata(artifact, ['promptId', 'mappedEntities']),
  optimized_prompt: (artifact) => requireMetadata(artifact, ['taskId', 'promptId']),
  run_summary: (artifact) => requireAnyMetadata(artifact, ['status', 'summary']),
  backlog_export: () => [],
  plan: (artifact) => requireMetadata(artifact, ['promptId', 'milestoneId']),
  test_plan: () => [],
  report: () => [],
  git_lifecycle: (artifact) => requireMetadata(artifact, ['taskId', 'runId', 'stage']),
};

export class ArtifactSchemaRegistry {
  validate(artifact: ArtifactRecord): string[] {
    const issues = validateArtifact(artifact);
    const byType = ARTIFACT_VALIDATORS[artifact.type];
    issues.push(...byType(artifact));
    return issues;
  }
}

export const defaultArtifactSchemaRegistry = new ArtifactSchemaRegistry();

function requireMetadata(artifact: ArtifactRecord, keys: string[]): string[] {
  return keys
    .filter((key) => !artifact.metadata[key]?.trim())
    .map((key) => `Artifact ${artifact.type} requires metadata.${key}`);
}

function requireAnyMetadata(artifact: ArtifactRecord, keys: string[]): string[] {
  if (keys.some((key) => artifact.metadata[key]?.trim())) {
    return [];
  }
  return [`Artifact ${artifact.type} requires at least one of metadata.${keys.join(', metadata.')}`];
}
