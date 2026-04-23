import type {
  ArchitectureFinding,
  ProjectDiscovery,
} from '../../core/src/index.ts';
import { defaultRoleOutputSchemaRegistry } from '../../core/src/index.ts';

export interface PlanningPrompt {
  id: string;
  role: 'planner';
  systemPrompt: string;
  taskPrompt: string;
  contextSummary: string;
  outputSchema: Record<string, unknown>;
}

export function buildPlanningPrompt(
  discovery: ProjectDiscovery,
  findings: ArchitectureFinding[],
): PlanningPrompt {
  return {
    id: crypto.randomUUID(),
    role: 'planner',
    systemPrompt: [
      'Convert architecture findings into milestones, epics, features, and bounded tasks.',
      'Every task must be actionable, have acceptance criteria, and preserve dependency-aware sequencing.',
      'Foundational stabilization work must come before broader feature work.',
    ].join(' '),
    taskPrompt: [
      `Discovery packages: ${discovery.packageInventory.join(', ') || 'none'}`,
      `Architecture findings: ${findings.length}`,
    ].join('\n'),
    contextSummary: [
      `packages=${discovery.packageInventory.length}`,
      `findings=${findings.length}`,
    ].join(' '),
    outputSchema: defaultRoleOutputSchemaRegistry.getSchema('planner'),
  };
}
