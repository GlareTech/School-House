// Maintainer utility: create the initial migration from the checked-in Prisma schema.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const cli = ['backend/node_modules/prisma/build/index.js','node_modules/prisma/build/index.js'].find(existsSync);
if (!cli) throw new Error('Install dependencies first');
const sqlServer = process.argv.includes('--sqlserver');
const directory = sqlServer ? 'backend/prisma-sqlserver' : 'backend/prisma';
const result = spawnSync(process.execPath, [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', `${directory}/schema.prisma`, '--script'], { encoding: 'utf8' });
if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
mkdirSync(`${directory}/migrations/20260904000000_initial`, { recursive: true });
const constraints = `
-- Application invariants also enforced for direct database writes.
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_duration_check" CHECK ("durationMinutes" BETWEEN 1 AND 360);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_window_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_check" CHECK (points BETWEEN 1 AND 100);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_revision_check" CHECK (revision >= 0);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_score_check" CHECK (score IS NULL OR (score >= 0 AND score <= "maxScore"));
`;
const sqlChecks = sqlServer ? `
ALTER TABLE [User] ADD CONSTRAINT [User_role_check] CHECK ([role] IN ('ADMIN','STUDENT'));
ALTER TABLE [Exam] ADD CONSTRAINT [Exam_status_check] CHECK ([status] IN ('DRAFT','PUBLISHED','CLOSED'));
ALTER TABLE [Attempt] ADD CONSTRAINT [Attempt_status_check] CHECK ([status] IN ('ACTIVE','SUBMITTED'));
ALTER TABLE [Attendance] ADD CONSTRAINT [Attendance_status_check] CHECK ([status] IN ('PRESENT','ABSENT','LATE','EXCUSED'));
ALTER TABLE [Attempt] ADD CONSTRAINT [Attempt_json_check] CHECK (ISJSON([questionOrder])=1 AND ISJSON([optionOrder])=1);
ALTER TABLE [SyncLog] ADD CONSTRAINT [SyncLog_json_check] CHECK (ISJSON([payload])=1);
ALTER TABLE [CloudReceipt] ADD CONSTRAINT [CloudReceipt_json_check] CHECK (ISJSON([payload])=1);
` : '';
writeFileSync(`${directory}/migrations/20260904000000_initial/migration.sql`, result.stdout + constraints + sqlChecks);
writeFileSync(`${directory}/migrations/migration_lock.toml`, `provider = "${sqlServer ? 'mssql' : 'postgresql'}"\n`);
console.log('Initial migration generated');
