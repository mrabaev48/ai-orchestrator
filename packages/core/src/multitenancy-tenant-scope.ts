export interface TenantScope {
  tenantId: string;
  projectId: string;
}

export function assertTenantScope(scope: TenantScope): void {
  assertScopePart(scope.tenantId, 'tenantId');
  assertScopePart(scope.projectId, 'projectId');
}

export function formatTenantScopePrefix(scope: TenantScope): string {
  assertTenantScope(scope);
  return `${scope.tenantId}:${scope.projectId}`;
}

function assertScopePart(value: string, field: 'tenantId' | 'projectId'): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.includes(':')) {
    throw new Error(`${field} must not include ':'`);
  }
}
