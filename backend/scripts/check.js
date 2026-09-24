import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]); }
for (const file of [...walk('src'), ...walk('prisma'), ...walk('test')].filter(f => f.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status) process.exit(result.status);
}
console.log('Backend syntax checks passed');
