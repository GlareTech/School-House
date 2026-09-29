-- Add an optional, tenant-scoped medical record document to each student.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "medicalRecordFileId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_medicalRecordFileId_key" ON "User"("medicalRecordFileId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_medicalRecordFileId_fkey') THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_medicalRecordFileId_fkey"
    FOREIGN KEY ("medicalRecordFileId") REFERENCES "StoredFile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
