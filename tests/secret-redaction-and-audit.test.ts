import test from 'node:test';
import assert from 'node:assert/strict';

import { redactSecrets } from '../packages/tools/src/secrets/redaction.ts';
import { buildImmutableAuditLog } from '../packages/state/src/audit/immutable-audit-log.ts';
import { makeEvent } from '../packages/core/src/events.ts';

test('redactSecrets redacts secret keys and secret-like values', () => {
  const input = {
    token: 'plain-token',
    nested: {
      authorization: 'Bearer abc',
      note: 'safe',
      apiKey: 'sk_0123456789abcdefghijkl',
    },
  };

  const output = redactSecrets(input);
  assert.equal(output.token, '[REDACTED]');
  assert.equal(output.nested.authorization, '[REDACTED]');
  assert.equal(output.nested.apiKey, '[REDACTED]');
  assert.equal(output.nested.note, 'safe');
});

test('buildImmutableAuditLog creates linked checksums', () => {
  const first = makeEvent('BOOTSTRAP_COMPLETED', { ok: true });
  const second = makeEvent('STATE_COMMITTED', { ok: true }, { runId: 'run-1' });
  const log = buildImmutableAuditLog([first, second]);

  assert.equal(log.length, 2);
  assert.ok(log[0]);
  assert.ok(log[1]);
  assert.equal(log[0].previousChecksum, null);
  assert.equal(log[1].previousChecksum, log[0].checksum);
  assert.notEqual(log[0].checksum, log[1].checksum);
  assert.equal(second.correlationId, 'run-1');
});
