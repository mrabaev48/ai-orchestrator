import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProject,
  assertRepository,
  projectSchema,
  repositorySchema,
  tenantSchema,
  type Project,
  type Repository,
  type Tenant,
} from '@ai-orchestrator/core';
import { StateIntegrityError } from '@ai-orchestrator/shared';

function assertThrowsWithDetail(fn: () => void, expectedDetail: RegExp): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof StateIntegrityError, 'expected a StateIntegrityError');
    const details = error.details;
    assert.ok(Array.isArray(details), 'expected error.details to be an array');
    assert.ok(
      details.some((detail) => typeof detail === 'string' && expectedDetail.test(detail)),
      `expected one detail to match ${expectedDetail} — got ${JSON.stringify(details)}`,
    );
    return true;
  });
}

function makeTenant(): Tenant {
  return {
    tenantId: 'tenant-1',
    name: 'Acme Corp',
    status: 'active',
    createdAt: '2026-05-01T10:00:00.000Z',
  };
}

function makeProject(): Project {
  return {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    name: 'AI Orchestrator',
    repositoryId: 'repo-1',
    autonomyLevel: 'L2',
    configVersion: 1,
    status: 'active',
    createdAt: '2026-05-01T10:00:00.000Z',
  };
}

function makeRepository(): Repository {
  return {
    repositoryId: 'repo-1',
    tenantId: 'tenant-1',
    provider: 'github',
    remoteUrl: 'https://github.com/acme/ai-orchestrator.git',
    defaultBranch: 'main',
    protectedPaths: [],
    verification: { commands: [] },
  };
}

test('tenantSchema parses a valid Tenant', () => {
  const parsed = tenantSchema.parse(makeTenant());
  assert.equal(parsed.tenantId, 'tenant-1');
});

test('assertProject accepts a valid Project', () => {
  assert.doesNotThrow(() => { assertProject(makeProject()); });
});

test('assertProject rejects an empty projectId', () => {
  assertThrowsWithDetail(
    () => { assertProject({ ...makeProject(), projectId: '' }); },
    /projectId: must be a non-empty string/,
  );
});

test('assertProject rejects a projectId containing ":"', () => {
  assertThrowsWithDetail(
    () => { assertProject({ ...makeProject(), projectId: 'a:b' }); },
    /projectId: must not include ':'/,
  );
});

test('assertProject rejects a tenantId containing ":"', () => {
  assertThrowsWithDetail(
    () => { assertProject({ ...makeProject(), tenantId: 'a:b' }); },
    /tenantId: must not include ':'/,
  );
});

test('assertProject rejects an unknown status', () => {
  assert.throws(() =>
    { assertProject({ ...makeProject(), status: 'deleted' as Project['status'] }); },
  );
});

test('assertProject rejects an unknown autonomyLevel', () => {
  assert.throws(() =>
    { assertProject({ ...makeProject(), autonomyLevel: 'L9' as Project['autonomyLevel'] }); },
  );
});

test('assertRepository accepts a valid Repository with empty arrays', () => {
  assert.doesNotThrow(() => { assertRepository(makeRepository()); });
});

test('assertRepository rejects an empty repositoryId', () => {
  assertThrowsWithDetail(
    () => { assertRepository({ ...makeRepository(), repositoryId: '' }); },
    /repositoryId: must be a non-empty string/,
  );
});

test('assertRepository rejects a repositoryId containing ":"', () => {
  assertThrowsWithDetail(
    () => { assertRepository({ ...makeRepository(), repositoryId: 'a:b' }); },
    /repositoryId: must not include ':'/,
  );
});

test('assertRepository rejects a tenantId containing ":"', () => {
  assertThrowsWithDetail(
    () => { assertRepository({ ...makeRepository(), tenantId: 'a:b' }); },
    /tenantId: must not include ':'/,
  );
});

test('assertRepository rejects an unknown provider', () => {
  assert.throws(() =>
    { assertRepository({ ...makeRepository(), provider: 'svn' as Repository['provider'] }); },
  );
});

test('repositorySchema accepts a local repository without a remote URL scheme', () => {
  const parsed = repositorySchema.parse({
    ...makeRepository(),
    provider: 'local',
    remoteUrl: '/var/repos/ai-orchestrator',
  });
  assert.equal(parsed.provider, 'local');
});

test('projectSchema round-trips a valid Project', () => {
  const parsed = projectSchema.parse(makeProject());
  assert.deepEqual(parsed, makeProject());
});
