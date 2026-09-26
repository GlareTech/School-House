ALTER TABLE "AppSetting" ADD COLUMN "gradingComponents" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "AppSetting" ADD COLUMN "sessionLabel" TEXT NOT NULL DEFAULT 'Session';
ALTER TABLE "AppSetting" ADD COLUMN "termLabel" TEXT NOT NULL DEFAULT 'Term';
