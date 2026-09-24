ALTER TABLE "User" ADD COLUMN "profilePictureId" TEXT;
CREATE UNIQUE INDEX "User_profilePictureId_key" ON "User"("profilePictureId");

CREATE TABLE "LibraryMaterial" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "author" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT '',
  "fileId" TEXT NOT NULL,
  "classId" TEXT,
  "subjectId" TEXT,
  "uploadedById" TEXT NOT NULL,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LibraryMaterial_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LibraryMaterial_classId_subjectId_published_idx" ON "LibraryMaterial"("classId", "subjectId", "published");
CREATE INDEX "LibraryMaterial_createdAt_idx" ON "LibraryMaterial"("createdAt");
ALTER TABLE "User" ADD CONSTRAINT "User_profilePictureId_fkey" FOREIGN KEY ("profilePictureId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LibraryMaterial" ADD CONSTRAINT "LibraryMaterial_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
