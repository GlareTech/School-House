BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(64) NOT NULL,
    [email] NVARCHAR(254) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [passwordHash] NVARCHAR(max) NOT NULL,
    [role] NVARCHAR(16) NOT NULL CONSTRAINT [User_role_df] DEFAULT 'STUDENT',
    [active] BIT NOT NULL CONSTRAINT [User_active_df] DEFAULT 1,
    [classId] NVARCHAR(64),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[Session] (
    [id] NVARCHAR(64) NOT NULL,
    [userId] NVARCHAR(64) NOT NULL,
    [csrf] NVARCHAR(64) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    CONSTRAINT [Session_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Class] (
    [id] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Class_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Class_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Class_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Exam] (
    [id] NVARCHAR(64) NOT NULL,
    [title] NVARCHAR(max) NOT NULL,
    [instructions] NVARCHAR(max) NOT NULL CONSTRAINT [Exam_instructions_df] DEFAULT '',
    [classId] NVARCHAR(64) NOT NULL,
    [durationMinutes] INT NOT NULL,
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [status] NVARCHAR(16) NOT NULL CONSTRAINT [Exam_status_df] DEFAULT 'DRAFT',
    [releaseResults] BIT NOT NULL CONSTRAINT [Exam_releaseResults_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Exam_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Exam_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Question] (
    [id] NVARCHAR(64) NOT NULL,
    [examId] NVARCHAR(64) NOT NULL,
    [prompt] NVARCHAR(max) NOT NULL,
    [points] INT NOT NULL CONSTRAINT [Question_points_df] DEFAULT 1,
    CONSTRAINT [Question_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Option] (
    [id] NVARCHAR(64) NOT NULL,
    [questionId] NVARCHAR(64) NOT NULL,
    [text] NVARCHAR(max) NOT NULL,
    [correct] BIT NOT NULL CONSTRAINT [Option_correct_df] DEFAULT 0,
    CONSTRAINT [Option_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Attempt] (
    [id] NVARCHAR(64) NOT NULL,
    [examId] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(16) NOT NULL CONSTRAINT [Attempt_status_df] DEFAULT 'ACTIVE',
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [Attempt_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [deadline] DATETIME2 NOT NULL,
    [submittedAt] DATETIME2,
    [score] INT,
    [maxScore] INT,
    [questionOrder] NVARCHAR(max) NOT NULL,
    [optionOrder] NVARCHAR(max) NOT NULL,
    [revision] INT NOT NULL CONSTRAINT [Attempt_revision_df] DEFAULT 0,
    [lastSaveId] NVARCHAR(64),
    [lastSeenAt] DATETIME2 NOT NULL CONSTRAINT [Attempt_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Attempt_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Attempt_examId_studentId_key] UNIQUE NONCLUSTERED ([examId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[StudentResponse] (
    [attemptId] NVARCHAR(64) NOT NULL,
    [questionId] NVARCHAR(64) NOT NULL,
    [optionId] NVARCHAR(64) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StudentResponse_pkey] PRIMARY KEY CLUSTERED ([attemptId],[questionId])
);

-- CreateTable
CREATE TABLE [dbo].[Incident] (
    [id] NVARCHAR(64) NOT NULL,
    [attemptId] NVARCHAR(64) NOT NULL,
    [kind] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Incident_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Incident_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Attendance] (
    [id] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [date] DATE NOT NULL,
    [status] NVARCHAR(16) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Attendance_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Attendance_studentId_date_key] UNIQUE NONCLUSTERED ([studentId],[date])
);

-- CreateTable
CREATE TABLE [dbo].[Payment] (
    [id] NVARCHAR(64) NOT NULL,
    [reference] NVARCHAR(100) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [amountMinor] INT NOT NULL,
    [currency] NVARCHAR(3) NOT NULL CONSTRAINT [Payment_currency_df] DEFAULT 'NGN',
    [description] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Payment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Payment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Payment_reference_key] UNIQUE NONCLUSTERED ([reference])
);

-- CreateTable
CREATE TABLE [dbo].[SyncLog] (
    [id] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64) NOT NULL,
    [kind] NVARCHAR(64) NOT NULL,
    [entityId] NVARCHAR(64) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SyncLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [syncedAt] DATETIME2,
    [attempts] INT NOT NULL CONSTRAINT [SyncLog_attempts_df] DEFAULT 0,
    [nextAttemptAt] DATETIME2 NOT NULL CONSTRAINT [SyncLog_nextAttemptAt_df] DEFAULT CURRENT_TIMESTAMP,
    [leaseUntil] DATETIME2,
    [leaseToken] NVARCHAR(36),
    [lastError] NVARCHAR(max),
    CONSTRAINT [SyncLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] NVARCHAR(64) NOT NULL,
    [actorId] NVARCHAR(64) NOT NULL,
    [action] NVARCHAR(max) NOT NULL,
    [entityId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CloudReceipt] (
    [id] NVARCHAR(64) NOT NULL,
    [siteId] NVARCHAR(64) NOT NULL,
    [kind] NVARCHAR(64) NOT NULL,
    [entityId] NVARCHAR(64) NOT NULL,
    [payload] NVARCHAR(max) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL,
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [CloudReceipt_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CloudReceipt_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [User_classId_idx] ON [dbo].[User]([classId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Session_expiresAt_idx] ON [dbo].[Session]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Exam_classId_status_idx] ON [dbo].[Exam]([classId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Question_examId_idx] ON [dbo].[Question]([examId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Option_questionId_idx] ON [dbo].[Option]([questionId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Attempt_status_deadline_idx] ON [dbo].[Attempt]([status], [deadline]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Incident_attemptId_idx] ON [dbo].[Incident]([attemptId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SyncLog_syncedAt_nextAttemptAt_idx] ON [dbo].[SyncLog]([syncedAt], [nextAttemptAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CloudReceipt_siteId_kind_entityId_occurredAt_idx] ON [dbo].[CloudReceipt]([siteId], [kind], [entityId], [occurredAt]);

-- AddForeignKey
ALTER TABLE [dbo].[User] ADD CONSTRAINT [User_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Session] ADD CONSTRAINT [Session_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Exam] ADD CONSTRAINT [Exam_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Question] ADD CONSTRAINT [Question_examId_fkey] FOREIGN KEY ([examId]) REFERENCES [dbo].[Exam]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Option] ADD CONSTRAINT [Option_questionId_fkey] FOREIGN KEY ([questionId]) REFERENCES [dbo].[Question]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Attempt] ADD CONSTRAINT [Attempt_examId_fkey] FOREIGN KEY ([examId]) REFERENCES [dbo].[Exam]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Attempt] ADD CONSTRAINT [Attempt_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudentResponse] ADD CONSTRAINT [StudentResponse_attemptId_fkey] FOREIGN KEY ([attemptId]) REFERENCES [dbo].[Attempt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudentResponse] ADD CONSTRAINT [StudentResponse_questionId_fkey] FOREIGN KEY ([questionId]) REFERENCES [dbo].[Question]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudentResponse] ADD CONSTRAINT [StudentResponse_optionId_fkey] FOREIGN KEY ([optionId]) REFERENCES [dbo].[Option]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Incident] ADD CONSTRAINT [Incident_attemptId_fkey] FOREIGN KEY ([attemptId]) REFERENCES [dbo].[Attempt]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Attendance] ADD CONSTRAINT [Attendance_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH


-- Application invariants also enforced for direct database writes.
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_duration_check" CHECK ("durationMinutes" BETWEEN 1 AND 360);
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_window_check" CHECK ("endsAt" > "startsAt");
ALTER TABLE "Question" ADD CONSTRAINT "Question_points_check" CHECK (points BETWEEN 1 AND 100);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check" CHECK ("amountMinor" > 0);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_revision_check" CHECK (revision >= 0);
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_score_check" CHECK (score IS NULL OR (score >= 0 AND score <= "maxScore"));

ALTER TABLE [User] ADD CONSTRAINT [User_role_check] CHECK ([role] IN ('ADMIN','STUDENT'));
ALTER TABLE [Exam] ADD CONSTRAINT [Exam_status_check] CHECK ([status] IN ('DRAFT','PUBLISHED','CLOSED'));
ALTER TABLE [Attempt] ADD CONSTRAINT [Attempt_status_check] CHECK ([status] IN ('ACTIVE','SUBMITTED'));
ALTER TABLE [Attendance] ADD CONSTRAINT [Attendance_status_check] CHECK ([status] IN ('PRESENT','ABSENT','LATE','EXCUSED'));
ALTER TABLE [Attempt] ADD CONSTRAINT [Attempt_json_check] CHECK (ISJSON([questionOrder])=1 AND ISJSON([optionOrder])=1);
ALTER TABLE [SyncLog] ADD CONSTRAINT [SyncLog_json_check] CHECK (ISJSON([payload])=1);
ALTER TABLE [CloudReceipt] ADD CONSTRAINT [CloudReceipt_json_check] CHECK (ISJSON([payload])=1);
