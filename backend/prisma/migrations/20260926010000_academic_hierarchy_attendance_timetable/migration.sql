ALTER TABLE "Class" ADD COLUMN "levelName" TEXT NOT NULL DEFAULT '', ADD COLUMN "groupName" TEXT NOT NULL DEFAULT '';
UPDATE "Class" SET "levelName" = "name" WHERE "levelName" = '';

ALTER TABLE "Subject" ADD COLUMN "codes" JSONB NOT NULL DEFAULT '[]';
UPDATE "Subject" SET "codes" = jsonb_build_array("code") WHERE "codes" = '[]'::jsonb;

ALTER TABLE "PromotionRule" ADD COLUMN "evaluationMode" TEXT NOT NULL DEFAULT 'OVERALL', ADD COLUMN "subjectMinimums" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "excludedSubjectIds" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "StaffAttendance" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PRESENT',
  "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT NOT NULL DEFAULT '',
  "organizationId" TEXT NOT NULL,
  CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId", "date");
CREATE INDEX "StaffAttendance_organizationId_date_idx" ON "StaffAttendance"("organizationId", "date");
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TimetableEntry" (
  "id" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startsAt" TEXT NOT NULL,
  "endsAt" TEXT NOT NULL,
  "room" TEXT NOT NULL DEFAULT '',
  "organizationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimetableEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TimetableEntry_classId_dayOfWeek_startsAt_key" ON "TimetableEntry"("classId", "dayOfWeek", "startsAt");
CREATE INDEX "TimetableEntry_organizationId_teacherId_dayOfWeek_idx" ON "TimetableEntry"("organizationId", "teacherId", "dayOfWeek");
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
