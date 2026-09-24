BEGIN TRY
  BEGIN TRAN;

  ALTER TABLE [dbo].[User] ADD
    [guardianAllowEmail] BIT NOT NULL CONSTRAINT [User_guardianAllowEmail_df] DEFAULT 1,
    [guardianAllowSms] BIT NOT NULL CONSTRAINT [User_guardianAllowSms_df] DEFAULT 1,
    [guardianEmail] NVARCHAR(254) NOT NULL CONSTRAINT [User_guardianEmail_df] DEFAULT '',
    [studentAllowEmail] BIT NOT NULL CONSTRAINT [User_studentAllowEmail_df] DEFAULT 1,
    [studentAllowSms] BIT NOT NULL CONSTRAINT [User_studentAllowSms_df] DEFAULT 1;

  CREATE TABLE [dbo].[CommunicationCampaign] (
    [id] NVARCHAR(64) NOT NULL,
    [subject] NVARCHAR(MAX) NOT NULL CONSTRAINT [CommunicationCampaign_subject_df] DEFAULT '',
    [body] NVARCHAR(MAX) NOT NULL,
    [audienceType] NVARCHAR(16) NOT NULL,
    [recipientType] NVARCHAR(16) NOT NULL,
    [classId] NVARCHAR(64) NULL,
    [senderId] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(32) NOT NULL CONSTRAINT [CommunicationCampaign_status_df] DEFAULT 'QUEUED',
    [recipientCount] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CommunicationCampaign_createdAt_df] DEFAULT SYSUTCDATETIME(),
    [completedAt] DATETIME2 NULL,
    CONSTRAINT [CommunicationCampaign_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CommunicationCampaign_recipient_count_check] CHECK ([recipientCount] > 0),
    CONSTRAINT [CommunicationCampaign_audience_type_check] CHECK ([audienceType] IN ('ALL','CLASS','INDIVIDUAL')),
    CONSTRAINT [CommunicationCampaign_recipient_type_check] CHECK ([recipientType] IN ('STUDENT','GUARDIAN','BOTH')),
    CONSTRAINT [CommunicationCampaign_status_check] CHECK ([status] IN ('QUEUED','COMPLETED','PARTIAL','FAILED','CANCELLED')),
    CONSTRAINT [CommunicationCampaign_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [dbo].[Class]([id]),
    CONSTRAINT [CommunicationCampaign_senderId_fkey] FOREIGN KEY ([senderId]) REFERENCES [dbo].[User]([id])
  );

  CREATE TABLE [dbo].[CommunicationRecipient] (
    [id] NVARCHAR(64) NOT NULL,
    [campaignId] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [recipientKind] NVARCHAR(16) NOT NULL,
    [channel] NVARCHAR(16) NOT NULL,
    [recipientName] NVARCHAR(150) NOT NULL,
    [destination] NVARCHAR(320) NOT NULL,
    [status] NVARCHAR(32) NOT NULL CONSTRAINT [CommunicationRecipient_status_df] DEFAULT 'QUEUED',
    [attempts] INT NOT NULL CONSTRAINT [CommunicationRecipient_attempts_df] DEFAULT 0,
    [availableAt] DATETIME2 NOT NULL CONSTRAINT [CommunicationRecipient_availableAt_df] DEFAULT SYSUTCDATETIME(),
    [leaseUntil] DATETIME2 NULL,
    [leaseToken] NVARCHAR(64) NULL,
    [sentAt] DATETIME2 NULL,
    [providerMessageId] NVARCHAR(500) NULL,
    [lastError] NVARCHAR(MAX) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CommunicationRecipient_createdAt_df] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [CommunicationRecipient_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CommunicationRecipient_campaignId_channel_destination_key] UNIQUE NONCLUSTERED ([campaignId],[channel],[destination]),
    CONSTRAINT [CommunicationRecipient_attempts_check] CHECK ([attempts] >= 0),
    CONSTRAINT [CommunicationRecipient_kind_check] CHECK ([recipientKind] IN ('STUDENT','GUARDIAN')),
    CONSTRAINT [CommunicationRecipient_channel_check] CHECK ([channel] IN ('EMAIL','SMS')),
    CONSTRAINT [CommunicationRecipient_status_check] CHECK ([status] IN ('QUEUED','SENDING','SENT','FAILED','CANCELLED')),
    CONSTRAINT [CommunicationRecipient_campaignId_fkey] FOREIGN KEY ([campaignId]) REFERENCES [dbo].[CommunicationCampaign]([id]),
    CONSTRAINT [CommunicationRecipient_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id])
  );

  CREATE NONCLUSTERED INDEX [CommunicationCampaign_createdAt_idx] ON [dbo].[CommunicationCampaign]([createdAt]);
  CREATE NONCLUSTERED INDEX [CommunicationCampaign_senderId_createdAt_idx] ON [dbo].[CommunicationCampaign]([senderId],[createdAt]);
  CREATE NONCLUSTERED INDEX [CommunicationRecipient_status_availableAt_idx] ON [dbo].[CommunicationRecipient]([status],[availableAt]);
  CREATE NONCLUSTERED INDEX [CommunicationRecipient_campaignId_status_idx] ON [dbo].[CommunicationRecipient]([campaignId],[status]);
  CREATE NONCLUSTERED INDEX [CommunicationRecipient_studentId_createdAt_idx] ON [dbo].[CommunicationRecipient]([studentId],[createdAt]);

  COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
