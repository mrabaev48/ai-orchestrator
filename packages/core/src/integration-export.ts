export interface IntegrationExportRecord {
  entityType: 'epic' | 'feature' | 'task' | 'artifact';
  internalId: string;
  title: string;
  status?: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  affectedModules: string[];
  traceability: Record<string, string>;
}

export interface IntegrationExportPayload {
  integrationTarget: 'generic_json';
  mappedEntities: IntegrationExportRecord[];
  missingRequiredFields: string[];
  exportBlockers: string[];
  recommendedFixes: string[];
}

export function validateIntegrationExportPayload(
  payload: IntegrationExportPayload,
): string[] {
  const issues: string[] = [];

  if (payload.mappedEntities.length === 0) {
    issues.push('Integration export must contain at least one mapped entity');
  }

  return issues;
}
