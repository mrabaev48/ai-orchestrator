export interface TestExecutionResult {
  passed: boolean;
  testPlan: string[];
  evidence: string[];
  failures: string[];
  missingCoverage: string[];
}

export function isTestPassed(result: TestExecutionResult): boolean {
  return result.passed && result.failures.length === 0;
}
