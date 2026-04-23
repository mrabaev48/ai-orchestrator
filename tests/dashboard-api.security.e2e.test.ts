import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import request from 'supertest';

import { createDashboardApiApp } from '../apps/dashboard-api/src/bootstrap.ts';
import { createDashboardAuthMiddleware } from '../apps/dashboard-api/src/security/dashboard-auth.middleware.ts';
import { verifyHs256Jwt } from '../apps/dashboard-api/src/security/jwt.ts';
import type { DashboardRuntimeContext } from '../apps/dashboard-api/src/config/dashboard-config.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1000,
    },
    state: {
      backend: 'memory',
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      sqlitePath: '/tmp/unused.db',
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask: 2,
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeRuntimeContext(corsOrigins: string[] = []): DashboardRuntimeContext {
  const runtimeConfig = makeRuntimeConfig();

  return {
    config: {
      host: '127.0.0.1',
      port: 0,
      runtime: runtimeConfig,
      security: {
        apiKeys: [
          { id: 'reader', key: 'reader-key', roles: ['dashboard.read'] },
          { id: 'guest', key: 'guest-key', roles: ['dashboard.guest'] },
        ],
        jwtSecret: 'test-jwt-secret-test-jwt-secret-1234',
        jwtIssuer: 'dashboard-tests',
        jwtAudience: 'dashboard-clients',
      },
      cors: {
        allowedOrigins: corsOrigins,
      },
    },
    logger: createLogger(runtimeConfig, { sink: () => {} }),
  };
}

test('dashboard api requires auth for control endpoints and keeps health public', async () => {
  const app = await createDashboardApiApp(makeRuntimeContext());
  await app.init();

  try {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const unauthenticated = await request(server).get('/api/state');
    const liveness = await request(server).get('/health/live');

    assert.equal(unauthenticated.status, 401);
    assert.equal(liveness.status, 200);
  } finally {
    await app.close();
  }
});

test('dashboard api enforces RBAC for API key and rejects invalid JWT', async () => {
  const app = await createDashboardApiApp(makeRuntimeContext());
  await app.init();

  try {
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    const forbidden = await request(server)
      .get('/api/state')
      .set('x-api-key', 'guest-key');
    const rejectedJwt = await request(server)
      .get('/api/state')
      .set('authorization', 'Bearer invalid.token.signature');

    assert.equal(forbidden.status, 403);
    assert.equal(rejectedJwt.status, 401);
  } finally {
    await app.close();
  }
});


test('dashboard auth middleware allows reader API keys', () => {
  const middleware = createDashboardAuthMiddleware(makeRuntimeContext().config);
  let isNextCalled = false;
  const requestMock = {
    method: 'GET',
    header: (name: string) => (name.toLowerCase() === 'x-api-key' ? 'reader-key' : undefined),
    headers: {},
  };
  const responseMock = {
    status: (statusCode: number) => {
      void statusCode;
      return {
        json: (payload: unknown) => {
          void payload;
          return undefined;
        },
      };
    },
  };

  middleware(
    requestMock as never,
    responseMock as never,
    () => {
      isNextCalled = true;
    },
  );

  assert.equal(isNextCalled, true);
});

test('verifyHs256Jwt validates issuer/audience/roles for dashboard auth', () => {
  const token = signJwt(
    {
      sub: 'jwt-reader',
      roles: ['dashboard.read'],
      iss: 'dashboard-tests',
      aud: 'dashboard-clients',
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    'test-jwt-secret-test-jwt-secret-1234',
  );

  const verified = verifyHs256Jwt(token, 'test-jwt-secret-test-jwt-secret-1234', {
    issuer: 'dashboard-tests',
    audience: 'dashboard-clients',
  });

  assert.deepEqual(verified, {
    subject: 'jwt-reader',
    roles: ['dashboard.read'],
  });
});

test('dashboard api CORS allows configured origins without wildcard', async () => {
  const app = await createDashboardApiApp(makeRuntimeContext(['https://dashboard.example.com']));
  await app.init();

  try {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .options('/api/state')
      .set('origin', 'https://dashboard.example.com')
      .set('access-control-request-method', 'GET');

    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], 'https://dashboard.example.com');
  } finally {
    await app.close();
  }
});

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
