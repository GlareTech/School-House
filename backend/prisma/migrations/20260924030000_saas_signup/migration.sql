CREATE TABLE "SignupIntent" (
  "id" TEXT NOT NULL,
  "schoolName" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignupIntent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SignupIntent_email_key" ON "SignupIntent"("email");
CREATE UNIQUE INDEX "SignupIntent_reference_key" ON "SignupIntent"("reference");
