CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "trialEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

CREATE TABLE "SubscriptionPlan" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "interval" TEXT NOT NULL DEFAULT 'monthly',
  "maxStudents" INTEGER NOT NULL,
  "features" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "paystackPlanCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

INSERT INTO "SubscriptionPlan" ("id","code","name","description","amountMinor","maxStudents","features","updatedAt") VALUES
('plan_starter','starter','Starter','Essential school operations for growing schools',500000,300,'["Student records","Attendance","CBT examinations","Email support"]',CURRENT_TIMESTAMP),
('plan_growth','growth','Growth','Advanced academic and communication workflows',1500000,1000,'["Everything in Starter","Assignments and grading","Reports and communication","Priority support"]',CURRENT_TIMESTAMP),
('plan_scale','scale','Scale','Complete operations for large school groups',3000000,5000,'["Everything in Growth","Hostel management","Advanced audit tools","Dedicated onboarding"]',CURRENT_TIMESTAMP);

INSERT INTO "Organization" ("id","name","slug","updatedAt") VALUES ('legacy_org','Schoolhouse','schoolhouse-existing',CURRENT_TIMESTAMP);

ALTER TABLE "User" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "StaffRole" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "AppSetting" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Class" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Exam" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Attendance" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Payment" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "SyncLog" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "CommunicationCampaign" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "AcademicSession" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Subject" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "StoredFile" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "Hostel" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'legacy_org';
ALTER TABLE "SignupIntent" ADD COLUMN "planId" TEXT NOT NULL DEFAULT 'plan_growth';

ALTER TABLE "User" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "StaffRole" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "AppSetting" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Class" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Exam" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Attendance" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "SyncLog" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "AuditLog" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "CommunicationCampaign" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "AcademicSession" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Subject" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "StoredFile" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "Hostel" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "SignupIntent" ALTER COLUMN "planId" DROP DEFAULT;

DROP INDEX IF EXISTS "StaffRole_name_key";
DROP INDEX IF EXISTS "Class_name_key";
DROP INDEX IF EXISTS "AcademicSession_name_key";
DROP INDEX IF EXISTS "Subject_code_key";
DROP INDEX IF EXISTS "Subject_name_key";
DROP INDEX IF EXISTS "Hostel_name_key";
CREATE UNIQUE INDEX "StaffRole_organizationId_name_key" ON "StaffRole"("organizationId","name");
CREATE UNIQUE INDEX "Class_organizationId_name_key" ON "Class"("organizationId","name");
CREATE UNIQUE INDEX "AcademicSession_organizationId_name_key" ON "AcademicSession"("organizationId","name");
CREATE UNIQUE INDEX "Subject_organizationId_code_key" ON "Subject"("organizationId","code");
CREATE UNIQUE INDEX "Subject_organizationId_name_key" ON "Subject"("organizationId","name");
CREATE UNIQUE INDEX "Hostel_organizationId_name_key" ON "Hostel"("organizationId","name");
CREATE UNIQUE INDEX "AppSetting_organizationId_key" ON "AppSetting"("organizationId");
CREATE INDEX "User_organizationId_role_idx" ON "User"("organizationId","role");
CREATE INDEX "Class_organizationId_idx" ON "Class"("organizationId");
CREATE INDEX "Exam_organizationId_idx" ON "Exam"("organizationId");
CREATE INDEX "Payment_organizationId_idx" ON "Payment"("organizationId");
CREATE INDEX "AcademicSession_organizationId_idx" ON "AcademicSession"("organizationId");
CREATE INDEX "Subject_organizationId_idx" ON "Subject"("organizationId");
CREATE INDEX "StoredFile_organizationId_idx" ON "StoredFile"("organizationId");
CREATE INDEX "Hostel_organizationId_idx" ON "Hostel"("organizationId");

ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignupIntent" ADD CONSTRAINT "SignupIntent_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "trialStartsAt" TIMESTAMP(3) NOT NULL,
  "trialEndsAt" TIMESTAMP(3) NOT NULL,
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "paystackCustomerCode" TEXT,
  "paystackSubscriptionCode" TEXT,
  "paystackEmailToken" TEXT,
  "authorizationCode" TEXT,
  "authorizationSignature" TEXT,
  "cardBrand" TEXT,
  "cardLast4" TEXT,
  "nextChargeAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Subscription_paystackSubscriptionCode_key" ON "Subscription"("paystackSubscriptionCode");
CREATE INDEX "Subscription_organizationId_status_idx" ON "Subscription"("organizationId","status");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PlatformAdmin" ("id" TEXT NOT NULL,"email" TEXT NOT NULL,"name" TEXT NOT NULL,"passwordHash" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"lastLoginAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE TABLE "PlatformSession" ("id" TEXT NOT NULL,"adminId" TEXT NOT NULL,"csrf" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PlatformSession_pkey" PRIMARY KEY ("id"));
CREATE INDEX "PlatformSession_expiresAt_idx" ON "PlatformSession"("expiresAt");
ALTER TABLE "PlatformSession" ADD CONSTRAINT "PlatformSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
