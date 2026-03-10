import type { ProjectDiscovery } from '../../core/src/index.ts';

export interface ArchitectureAnalysisPrompt {
  id: string;
  role: 'architect';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildArchitectureAnalysisPrompt(
  discovery: ProjectDiscovery,
  sourceImportCount: number,
): ArchitectureAnalysisPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'architect',
    systemPrompt: [
      'Identify structural risks and architecture-relevant findings.',
      'Ground all findings in actual structure and distinguish evidence from inference.',
      'Avoid broad rewrite recommendations without strong justification.',
    ].join(' '),
    taskPrompt: [
      `Package inventory: ${discovery.packageInventory.join(', ') || 'none'}`,
      `Critical paths: ${discovery.criticalPaths.join(', ') || 'none'}`,
      `Unstable areas: ${discovery.unstableAreaCandidates.join(', ') || 'none'}`,
      `Observed source imports: ${String(sourceImportCount)}`,
    ].join('\n'),
    contextSummary: [
      `packages=${discovery.packageInventory.length}`,
      `criticalPaths=${discovery.criticalPaths.length}`,
      `unstableAreas=${discovery.unstableAreaCandidates.length}`,
    ].join(' '),
    outputSchema: {
      type: 'object',
      required: ['findings', 'riskSummary'],
      properties: {
        findings: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'subsystem',
              'issueType',
              'description',
              'impact',
              'recommendation',
              'affectedModules',
              'severity',
            ],
          },
        },
        riskSummary: { type: 'string' },
      },
    },
  };
}
