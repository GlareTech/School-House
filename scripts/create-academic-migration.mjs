import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
dotenv.config({path:new URL('../.env',import.meta.url),quiet:true});
const cli=new URL('../backend/node_modules/prisma/build/index.js',import.meta.url).pathname.slice(1);
const result=spawnSync(process.execPath,[cli,'migrate','diff','--from-url',process.env.DATABASE_URL,'--to-schema-datamodel','backend/prisma-sqlserver/schema.prisma','--script'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:process.env});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1)}
const dir=new URL('../backend/prisma-sqlserver/migrations/20260904020000_academic_management/',import.meta.url);
mkdirSync(dir,{recursive:true});writeFileSync(new URL('migration.sql',dir),result.stdout);
console.log('Created additive SQL Server academic-management migration.');
