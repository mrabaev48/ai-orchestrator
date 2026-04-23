import type { AgentRoleName, RoleResponse } from '../../core/src/roles.ts';
import { defaultRoleOutputSchemaRegistry, validateRoleResponse } from '../../core/src/index.ts';
import { SchemaValidationError } from '../../shared/src/index.ts';

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
