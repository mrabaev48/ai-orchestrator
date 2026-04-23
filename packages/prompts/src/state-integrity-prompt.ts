import { defaultRoleOutputSchemaRegistry } from '../../core/src/index.ts';

export interface StateIntegrityPrompt {
  id: string;
  role: 'state_steward';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildStateIntegrityPrompt(input: {
  issueCount: number;
  issues: string[];
}): StateIntegrityPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'state_steward',
    systemPrompt: [
      'Validate and protect orchestration state integrity.',
      'Never invent state silently and produce repair recommendations explicitly.',
      'Prefer repair guidance over automatic mutation unless the fix is clearly non-destructive.',
    ].join(' '),
    taskPrompt: [
      `Detected issues: ${input.issueCount}`,
      ...input.issues.map((issue) => `- ${issue}`),
    ].join('\n'),
    contextSummary: `issues=${input.issueCount}`,
    outputSchema: defaultRoleOutputSchemaRegistry.getSchema('state_steward'),
  };
}
