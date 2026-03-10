export interface IntegrationExportPrompt {
  id: string;
  role: 'integration_manager';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildIntegrationExportPrompt(input: {
  taskCount: number;
  artifactCount: number;
  blockedTaskCount: number;
}): IntegrationExportPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'integration_manager',
    systemPrompt: [
      'Prepare validated external export payloads from internal orchestration state.',
      'Preserve internal IDs, dependencies, acceptance criteria, and traceability.',
      'Do not invent missing external metadata and surface export blockers explicitly.',
    ].join(' '),
    taskPrompt: [
      `Tasks: ${String(input.taskCount)}`,
      `Artifacts: ${String(input.artifactCount)}`,
      `Blocked tasks: ${String(input.blockedTaskCount)}`,
    ].join('\n'),
    contextSummary: `tasks=${input.taskCount} artifacts=${input.artifactCount} blocked=${input.blockedTaskCount}`,
    outputSchema: {
      type: 'object',
      required: [
        'integrationTarget',
        'mappedEntities',
        'missingRequiredFields',
        'exportBlockers',
        'recommendedFixes',
      ],
      properties: {
        integrationTarget: { type: 'string' },
        mappedEntities: { type: 'array', items: { type: 'object' } },
        missingRequiredFields: { type: 'array', items: { type: 'string' } },
        exportBlockers: { type: 'array', items: { type: 'string' } },
        recommendedFixes: { type: 'array', items: { type: 'string' } },
      },
    },
  };
}
