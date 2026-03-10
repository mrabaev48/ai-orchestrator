import { z } from 'zod';

import {
  createLogger,
  loadRuntimeConfig,
  type Logger,
  type RuntimeConfig,
} from '../../../../packages/shared/src/index.ts';

const dashboardEnvSchema = z.object({
  DASHBOARD_API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  DASHBOARD_API_PORT: z.coerce.number().int().positive().default(3100),
});

export interface DashboardApiConfig {
  host: string;
  port: number;
  runtime: RuntimeConfig;
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

  return {
    config: {
      host: env.DASHBOARD_API_HOST,
      port: env.DASHBOARD_API_PORT,
      runtime,
    },
    logger: createLogger(runtime),
  };
}
