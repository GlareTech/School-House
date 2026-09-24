ALTER TABLE "User"
  ADD COLUMN "guardianAllowEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "guardianAllowSms" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "guardianEmail" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "studentAllowEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "studentAllowSms" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "CommunicationCampaign" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "audienceType" TEXT NOT NULL,
  "recipientType" TEXT NOT NULL,
  "classId" TEXT,
  "senderId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "recipientCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CommunicationCampaign_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationCampaign_recipient_count_check" CHECK ("recipientCount" > 0),
  CONSTRAINT "CommunicationCampaign_audience_type_check" CHECK ("audienceType" IN ('ALL','CLASS','INDIVIDUAL')),
  CONSTRAINT "CommunicationCampaign_recipient_type_check" CHECK ("recipientType" IN ('STUDENT','GUARDIAN','BOTH')),
  CONSTRAINT "CommunicationCampaign_status_check" CHECK ("status" IN ('QUEUED','COMPLETED','PARTIAL','FAILED','CANCELLED'))
);

CREATE TABLE "CommunicationRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "recipientKind" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "sentAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationRecipient_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "CommunicationRecipient_kind_check" CHECK ("recipientKind" IN ('STUDENT','GUARDIAN')),
  CONSTRAINT "CommunicationRecipient_channel_check" CHECK ("channel" IN ('EMAIL','SMS')),
  CONSTRAINT "CommunicationRecipient_status_check" CHECK ("status" IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED'))
);

CREATE INDEX "CommunicationCampaign_createdAt_idx" ON "CommunicationCampaign"("createdAt");
CREATE INDEX "CommunicationCampaign_senderId_createdAt_idx" ON "CommunicationCampaign"("senderId", "createdAt");
CREATE INDEX "CommunicationRecipient_status_availableAt_idx" ON "CommunicationRecipient"("status", "availableAt");
CREATE INDEX "CommunicationRecipient_campaignId_status_idx" ON "CommunicationRecipient"("campaignId", "status");
CREATE INDEX "CommunicationRecipient_studentId_createdAt_idx" ON "CommunicationRecipient"("studentId", "createdAt");
CREATE UNIQUE INDEX "CommunicationRecipient_campaignId_channel_destination_key" ON "CommunicationRecipient"("campaignId", "channel", "destination");

ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommunicationCampaign" ADD CONSTRAINT "CommunicationCampaign_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "CommunicationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunicationRecipient" ADD CONSTRAINT "CommunicationRecipient_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
