import { createDashboardApiApp } from './bootstrap.js';
import { loadDashboardRuntimeContext } from './config/dashboard-config.js';

async function main(): Promise<void> {
  const runtimeContext = loadDashboardRuntimeContext();
  const app = await createDashboardApiApp(runtimeContext);

  await app.listen(runtimeContext.config.port, runtimeContext.config.host);
}

void main();
