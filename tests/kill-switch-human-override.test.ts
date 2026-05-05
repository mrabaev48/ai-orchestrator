import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateKillSwitch, evaluateHumanOverride } from '../packages/application/src/index.ts';

test('kill switch allows read-only command when active', () => {
  const decision = evaluateKillSwitch({
    command: 'show-state',
    commandPolicy: 'read_only',
    killSwitch: { active: true, reason: 'incident' },
  });

  assert.equal(decision.allowed, true);
});

test('kill switch blocks restricted command when active', () => {
  const decision = evaluateKillSwitch({
    command: 'run-cycle',
    commandPolicy: 'restricted',
    killSwitch: { active: true, reason: 'incident', activatedAt: '2026-05-05T00:00:00.000Z' },
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, 'kill_switch_active');
});

test('human override denies expired token', () => {
  const decision = evaluateHumanOverride({
    actorSubject: 'operator-1',
    overrideToken: 'token',
    overrideReason: 'approved by incident commander',
    overrideTicketId: 'INC-42',
    overrideExpiresAt: '2026-05-05T10:00:00.000Z',
    nowIso: '2026-05-05T10:00:01.000Z',
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, 'human_override_expired');
});

test('human override allows valid token payload', () => {
  const decision = evaluateHumanOverride({
    actorSubject: 'operator-1',
    overrideToken: 'token',
    overrideReason: 'approved by incident commander',
    overrideTicketId: 'INC-42',
    overrideExpiresAt: '2026-05-05T10:00:00.000Z',
    nowIso: '2026-05-05T09:00:00.000Z',
  });

  assert.equal(decision.allowed, true);
});
