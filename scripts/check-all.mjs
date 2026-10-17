import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const file of (await readdir('scripts'))
  .filter((file) => /^check-.*\.mjs$/.test(file) && file !== 'check-all.mjs')
  .sort()) {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', `scripts/${file}`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
