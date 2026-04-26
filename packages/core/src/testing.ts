export type QualityStageName = 'build' | 'lint' | 'typecheck' | 'test';
export type QualityStageStatus = 'passing' | 'failing';

export interface QualityStageResult {
  stage: QualityStageName;
  status: QualityStageStatus;
  diagnostics: string[];
}

export interface TestExecutionResult {
  passed: boolean;
  testPlan: string[];
  evidence: string[];
  failures: string[];
  missingCoverage: string[];
  qualityStages?: QualityStageResult[];
}

export function isTestPassed(result: TestExecutionResult): boolean {
  return result.passed && result.failures.length === 0;
}
