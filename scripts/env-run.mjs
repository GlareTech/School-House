// Load root configuration before invoking a workspace command. Existing shell values win.
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const script = process.argv[2];
if (!['db:generate','db:migrate','db:seed'].includes(script)) throw new Error('Unsupported database command');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run through npm scripts');
const args = [npmCli, 'run', script, '-w', 'backend'];
if (process.env.DATABASE_PROVIDER === 'sqlserver' && script !== 'db:seed') args.push('--', '--schema', 'prisma-sqlserver/schema.prisma');
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', err => { console.error(err.message); process.exit(1); });
