CREATE TABLE "ProgressReport" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "reportType" TEXT NOT NULL DEFAULT 'MID_TERM',
  "title" TEXT NOT NULL DEFAULT 'MID-TERM PROGRESS REPORT',
  "rows" JSONB NOT NULL,
  "traits" JSONB NOT NULL,
  "teacherComment" TEXT NOT NULL DEFAULT '',
  "administratorComment" TEXT NOT NULL DEFAULT '',
  "signedBy" TEXT NOT NULL DEFAULT '',
  "reportDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgressReport_studentId_termId_reportType_key" ON "ProgressReport"("studentId","termId","reportType");
CREATE INDEX "ProgressReport_termId_status_idx" ON "ProgressReport"("termId","status");
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
