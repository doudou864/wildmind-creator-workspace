import { spawnSync } from 'node:child_process';
for (const task of ['format:check', 'typecheck', 'test']) {
  const result = spawnSync('npm', ['run', task], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
