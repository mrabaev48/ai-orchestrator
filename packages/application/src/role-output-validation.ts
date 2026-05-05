import type { AgentRoleName, RoleResponse } from '@ai-orchestrator/core';
import { defaultRoleOutputSchemaRegistry, validateRoleResponse } from '@ai-orchestrator/core';
import { SchemaValidationError } from '@ai-orchestrator/shared';

export function assertRoleOutput(role: AgentRoleName, response: RoleResponse<unknown>): void {
  const envelopeIssues = validateRoleResponse(role, response);
  const outputIssues = defaultRoleOutputSchemaRegistry.validate(role, response.output);
  const issues = [...envelopeIssues, ...outputIssues];
  if (issues.length > 0) {
    throw new SchemaValidationError('Role response registry validation failed', {
      details: {
        role,
        issues,
      },
      retrySuggested: false,
    });
  }
}
