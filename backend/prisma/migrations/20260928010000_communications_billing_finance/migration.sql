CREATE TABLE "PlatformCommunicationPrice" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "smsPriceMinor" INTEGER NOT NULL DEFAULT 500,
  "emailPriceMinor" INTEGER NOT NULL DEFAULT 100,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformCommunicationPrice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "feeSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN "feeStructureId" TEXT;
ALTER TABLE "CommunicationCampaign" ADD COLUMN "estimatedCostMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommunicationCampaign" ADD COLUMN "chargedCostMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommunicationRecipient" ADD COLUMN "unitPriceMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommunicationRecipient" ADD COLUMN "walletState" TEXT NOT NULL DEFAULT 'FREE';

CREATE TABLE "FinanceSetting" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "suspendUnpaidStudents" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceSetting_organizationId_key" ON "FinanceSetting"("organizationId");

CREATE TABLE "FeeStructure" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "classId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "termId" TEXT,
  "name" TEXT NOT NULL,
  "amountMinor" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "dueDate" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeeStructure_org_class_session_term_name_key" ON "FeeStructure"("organizationId", "classId", "sessionId", "termId", "name");
CREATE INDEX "FeeStructure_organizationId_sessionId_classId_idx" ON "FeeStructure"("organizationId", "sessionId", "classId");

CREATE TABLE "StudentFeeConcession" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "feeStructureId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "percent" INTEGER NOT NULL DEFAULT 0,
  "amountMinor" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentFeeConcession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentFeeConcession_studentId_feeStructureId_key" ON "StudentFeeConcession"("studentId", "feeStructureId");
CREATE INDEX "StudentFeeConcession_feeStructureId_idx" ON "StudentFeeConcession"("feeStructureId");

ALTER TABLE "FinanceSetting" ADD CONSTRAINT "FinanceSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeConcession" ADD CONSTRAINT "StudentFeeConcession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentFeeConcession" ADD CONSTRAINT "StudentFeeConcession_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformCommunicationPrice" ADD CONSTRAINT "PlatformCommunicationPrice_nonnegative" CHECK ("smsPriceMinor" >= 0 AND "emailPriceMinor" >= 0);
ALTER TABLE "FeeStructure" ADD CONSTRAINT "FeeStructure_amount_positive" CHECK ("amountMinor" > 0);
ALTER TABLE "StudentFeeConcession" ADD CONSTRAINT "StudentFeeConcession_values_valid" CHECK ("percent" BETWEEN 0 AND 100 AND "amountMinor" >= 0 AND "kind" IN ('SCHOLARSHIP','DISCOUNT'));
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_unit_price_nonnegative" CHECK ("unitPriceMinor" >= 0);
