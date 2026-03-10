import { createDashboardApiApp } from './bootstrap.ts';
import { loadDashboardRuntimeContext } from './config/dashboard-config.ts';

async function main(): Promise<void> {
  const runtimeContext = loadDashboardRuntimeContext();
  const app = await createDashboardApiApp(runtimeContext);

  await app.listen(runtimeContext.config.port, runtimeContext.config.host);
}

void main();
