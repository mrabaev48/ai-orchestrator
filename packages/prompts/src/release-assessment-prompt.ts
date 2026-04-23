import { defaultRoleOutputSchemaRegistry } from '../../core/src/index.ts';

export interface ReleaseAssessmentPrompt {
  id: string;
  role: 'release_auditor';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildReleaseAssessmentPrompt(input: {
  blockers: string[];
  warnings: string[];
  evidence: string[];
}): ReleaseAssessmentPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'release_auditor',
    systemPrompt: [
      'Assess whether the current body of work is stable enough to be considered release-ready.',
      'Ground all statements in available evidence and distinguish blockers from deferrable improvements.',
      'Do not approve readiness based on optimism.',
    ].join(' '),
    taskPrompt: [
      `Known blockers: ${input.blockers.join(', ') || 'none'}`,
      `Known warnings: ${input.warnings.join(', ') || 'none'}`,
      `Evidence: ${input.evidence.join(', ') || 'none'}`,
    ].join('\n'),
    contextSummary: `blockers=${input.blockers.length} warnings=${input.warnings.length} evidence=${input.evidence.length}`,
    outputSchema: defaultRoleOutputSchemaRegistry.getSchema('release_auditor'),
  };
}
