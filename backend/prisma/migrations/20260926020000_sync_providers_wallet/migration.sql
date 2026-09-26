CREATE TABLE "CommunicationProviderSetting" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"emailProvider" TEXT NOT NULL DEFAULT 'PLATFORM',"resendApiKeyEncrypted" TEXT NOT NULL DEFAULT '',"emailFrom" TEXT NOT NULL DEFAULT '',"smsProvider" TEXT NOT NULL DEFAULT 'DISABLED',"twilioSidEncrypted" TEXT NOT NULL DEFAULT '',"twilioTokenEncrypted" TEXT NOT NULL DEFAULT '',"twilioFrom" TEXT NOT NULL DEFAULT '',"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "CommunicationProviderSetting_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "CommunicationProviderSetting_organizationId_key" ON "CommunicationProviderSetting"("organizationId");
ALTER TABLE "CommunicationProviderSetting" ADD CONSTRAINT "CommunicationProviderSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Wallet" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"balanceMinor" INTEGER NOT NULL DEFAULT 0,"currency" TEXT NOT NULL DEFAULT 'NGN',"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Wallet_organizationId_key" ON "Wallet"("organizationId");
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "WalletTransaction" ("id" TEXT NOT NULL,"walletId" TEXT NOT NULL,"type" TEXT NOT NULL,"amountMinor" INTEGER NOT NULL,"reference" TEXT NOT NULL,"description" TEXT NOT NULL,"createdById" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "WalletTransaction_walletId_reference_key" ON "WalletTransaction"("walletId","reference");
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId","createdAt");
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SyncDevice" ("id" TEXT NOT NULL,"organizationId" TEXT NOT NULL,"name" TEXT NOT NULL,"siteId" TEXT NOT NULL,"tokenHash" TEXT NOT NULL,"active" BOOLEAN NOT NULL DEFAULT true,"lastSeenAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SyncDevice_tokenHash_key" ON "SyncDevice"("tokenHash");
CREATE UNIQUE INDEX "SyncDevice_organizationId_siteId_key" ON "SyncDevice"("organizationId","siteId");
CREATE INDEX "SyncDevice_organizationId_idx" ON "SyncDevice"("organizationId");
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "DeviceSyncEvent" ("id" TEXT NOT NULL,"deviceId" TEXT NOT NULL,"sequence" INTEGER NOT NULL,"kind" TEXT NOT NULL,"entityId" TEXT NOT NULL,"entityVersion" INTEGER NOT NULL,"payload" JSONB NOT NULL,"occurredAt" TIMESTAMP(3) NOT NULL,"receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "DeviceSyncEvent_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "DeviceSyncEvent_deviceId_sequence_key" ON "DeviceSyncEvent"("deviceId","sequence");
CREATE INDEX "DeviceSyncEvent_deviceId_kind_entityId_entityVersion_idx" ON "DeviceSyncEvent"("deviceId","kind","entityId","entityVersion");
ALTER TABLE "DeviceSyncEvent" ADD CONSTRAINT "DeviceSyncEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
