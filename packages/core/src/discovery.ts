export interface ProjectDiscovery {
  generatedAt: string;
  packageMap: Record<string, string[]>;
  subsystemMap: Record<string, string[]>;
  packageInventory: string[];
  entryPoints: string[];
  testInfrastructure: string[];
  healthObservations: string[];
  unstableAreaCandidates: string[];
  criticalPaths: string[];
  recommendedNextStep: string;
}

export function createEmptyProjectDiscovery(): ProjectDiscovery {
  return {
    generatedAt: '',
    packageMap: {},
    subsystemMap: {},
    packageInventory: [],
    entryPoints: [],
    testInfrastructure: [],
    healthObservations: [],
    unstableAreaCandidates: [],
    criticalPaths: [],
    recommendedNextStep: 'bootstrap_analysis',
  };
}

export function validateProjectDiscovery(discovery: ProjectDiscovery): string[] {
  const issues: string[] = [];

  if (!discovery.recommendedNextStep.trim()) {
    issues.push('Discovery recommendedNextStep is required');
  }

  if (discovery.packageInventory.some((item) => !item.trim())) {
    issues.push('Discovery packageInventory must not contain empty entries');
  }

  if (discovery.criticalPaths.some((item) => !item.trim())) {
    issues.push('Discovery criticalPaths must not contain empty entries');
  }

  return issues;
}
