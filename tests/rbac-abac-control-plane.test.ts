import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateControlPlaneAccess } from '../packages/application/src/authorization/evaluate-access.ts';
import { authorizeControlPlaneCommand } from '../apps/control-plane/src/authz/rbac-abac.ts';
import { SafetyViolationError } from '../packages/shared/src/index.ts';

test('RBAC/ABAC allows operator on same team in local environment', () => {
  const decision = evaluateControlPlaneAccess({
    principal: { subject: 'alice', roles: ['control-plane.operator'], attributes: { team: 'platform' } },
    action: 'control_plane.run_task',
    resource: { projectId: 'p1', environment: 'local', ownerTeam: 'platform' },
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'allow');
});

test('RBAC denies command when required role is missing', () => {
  const decision = evaluateControlPlaneAccess({
    principal: { subject: 'bob', roles: ['control-plane.viewer'] },
    action: 'control_plane.run_cycle',
    resource: { projectId: 'p1', environment: 'local' },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'rbac_denied');
});

test('ABAC denies cross-team access without admin role (regression)', () => {
  const decision = evaluateControlPlaneAccess({
    principal: { subject: 'charlie', roles: ['control-plane.operator'], attributes: { team: 'ml' } },
    action: 'control_plane.resume_failure',
    resource: { projectId: 'p1', environment: 'local', ownerTeam: 'platform' },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'abac_denied');
});

test('ABAC denies production mutations for non-admin role', () => {
  assert.throws(
    () => {
      authorizeControlPlaneCommand({
      command: 'run-task',
      principal: { subject: 'operator', roles: ['control-plane.operator'], team: 'platform' },
      resource: { projectId: 'p1', environment: 'prod', ownerTeam: 'platform' },
      });
    },
    (error: unknown) => error instanceof SafetyViolationError,
  );
});
