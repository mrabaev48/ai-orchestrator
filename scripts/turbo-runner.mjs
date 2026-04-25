#!/usr/bin/env node

const [, , command, taskName] = process.argv;

if (command !== 'run' || !taskName) {
  console.error('Usage: turbo run <lint|typecheck|test|build>');
  process.exit(1);
}

const taskOrder = ['lint', 'typecheck', 'test', 'build'];
if (!taskOrder.includes(taskName)) {
  console.error(`Unsupported task: ${taskName}`);
  process.exit(1);
}

const { spawnSync } = await import('node:child_process');

const selectedIndex = taskOrder.indexOf(taskName);
for (const currentTask of taskOrder.slice(0, selectedIndex + 1)) {
  const result = spawnSync('pnpm', ['run', currentTask], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
