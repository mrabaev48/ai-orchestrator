import { z } from 'zod';

import {
  ConfigError,
  createLogger,
  loadRuntimeConfig,
  type Logger,
  type RuntimeConfig,
} from '../../../../packages/shared/src/index.ts';

const dashboardEnvSchema = z.object({
  DASHBOARD_API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  DASHBOARD_API_PORT: z.coerce.number().int().positive().default(3100),
  DASHBOARD_API_KEYS: z.string().optional(),
  DASHBOARD_API_JWT_SECRET: z.string().trim().min(32).optional(),
  DASHBOARD_API_JWT_ISSUER: z.string().trim().min(1).optional(),
  DASHBOARD_API_JWT_AUDIENCE: z.string().trim().min(1).optional(),
  DASHBOARD_API_ALLOWED_ORIGINS: z.string().optional(),
});

export interface DashboardApiKeyRecord {
  id: string;
  key: string;
  roles: string[];
}

export interface DashboardApiSecurityConfig {
  apiKeys: DashboardApiKeyRecord[];
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtAudience?: string;
}

export interface DashboardApiCorsConfig {
  allowedOrigins: string[];
}

export interface DashboardApiConfig {
  host: string;
  port: number;
  runtime: RuntimeConfig;
  security: DashboardApiSecurityConfig;
  cors: DashboardApiCorsConfig;
}

export interface DashboardRuntimeContext {
  config: DashboardApiConfig;
  logger: Logger;
}

export function loadDashboardRuntimeContext(options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}): DashboardRuntimeContext {
  const env = dashboardEnvSchema.parse(options.env ?? process.env);
  const runtime = loadRuntimeConfig(options);

  const security = parseSecurityConfig(env.DASHBOARD_API_KEYS, {
    jwtSecret: env.DASHBOARD_API_JWT_SECRET,
    jwtIssuer: env.DASHBOARD_API_JWT_ISSUER,
    jwtAudience: env.DASHBOARD_API_JWT_AUDIENCE,
  });

  return {
    config: {
      host: env.DASHBOARD_API_HOST,
      port: env.DASHBOARD_API_PORT,
      runtime,
      security,
      cors: {
        allowedOrigins: parseAllowedOrigins(env.DASHBOARD_API_ALLOWED_ORIGINS),
      },
    },
    logger: createLogger(runtime),
  };
}

function parseSecurityConfig(
  rawApiKeys: string | undefined,
  jwt: { jwtSecret: string | undefined; jwtIssuer: string | undefined; jwtAudience: string | undefined },
): DashboardApiSecurityConfig {
  const apiKeys = parseApiKeys(rawApiKeys);
  if (apiKeys.length === 0 && !jwt.jwtSecret) {
    throw new ConfigError(
      'Dashboard API authentication is required. Configure DASHBOARD_API_KEYS or DASHBOARD_API_JWT_SECRET.',
    );
  }

  return {
    apiKeys,
    ...(jwt.jwtSecret ? { jwtSecret: jwt.jwtSecret } : {}),
    ...(jwt.jwtIssuer ? { jwtIssuer: jwt.jwtIssuer } : {}),
    ...(jwt.jwtAudience ? { jwtAudience: jwt.jwtAudience } : {}),
  };
}

function parseApiKeys(rawValue: string | undefined): DashboardApiKeyRecord[] {
  if (!rawValue?.trim()) {
    return [];
  }

  return rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry, index) => {
      const [idAndKey, rolesPart] = entry.split('@');
      if (!idAndKey) {
        throw new ConfigError(`Invalid DASHBOARD_API_KEYS entry at index ${index}. Expected id:key@role1|role2.`);
      }

      const [idPart, keyPart] = idAndKey.split(':');

      const id = idPart?.trim();
      const key = keyPart?.trim();
      if (!id || !key) {
        throw new ConfigError(`Invalid DASHBOARD_API_KEYS entry at index ${index}. Expected id:key@role1|role2.`);
      }

      const roles = (rolesPart ?? '')
        .split('|')
        .map((role) => role.trim())
        .filter((role) => role.length > 0);

      if (roles.length === 0) {
        throw new ConfigError(`DASHBOARD_API_KEYS entry "${id}" must include at least one role.`);
      }

      return {
        id,
        key,
        roles,
      };
    });
}

function parseAllowedOrigins(rawValue: string | undefined): string[] {
  if (!rawValue?.trim()) {
    return [];
  }

  const origins = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (origins.includes('*')) {
    throw new ConfigError('DASHBOARD_API_ALLOWED_ORIGINS must not contain wildcard origin "*".');
  }

  return origins;
}
