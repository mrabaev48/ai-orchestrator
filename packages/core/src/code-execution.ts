export interface CodeExecutionEvidence {
  type: 'tool_observation' | 'workspace_diff' | 'artifact' | 'llm_decision' | 'no_op';
  description: string;
  reference?: string;
}

export interface CodeExecutionOutput {
  changed: boolean;
  summary: string;
  changedFiles: string[];
  evidence: CodeExecutionEvidence[];
  noOpReason?: string;
}

export function validateCodeExecutionOutput(output: CodeExecutionOutput): string[] {
  const issues: string[] = [];
  if (!output.summary?.trim()) {
    issues.push('Coder output summary is required');
  }
  if (!Array.isArray(output.changedFiles)) {
    issues.push('Coder output changedFiles must be an array');
  }
  if (!Array.isArray(output.evidence)) {
    issues.push('Coder output evidence must be an array');
  }
  if (output.changed) {
    if (!Array.isArray(output.evidence) || output.evidence.length === 0) {
      issues.push('Coder output changed=true requires evidence');
    }
    if (!Array.isArray(output.changedFiles) || output.changedFiles.length === 0) {
      issues.push('Coder output changed=true requires changedFiles');
    }
  } else if (!output.noOpReason?.trim()) {
    issues.push('Coder output changed=false requires noOpReason');
  }
  return issues;
}
