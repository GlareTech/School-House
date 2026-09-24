BEGIN TRY

BEGIN TRAN;

-- DropIndex
DROP INDEX [Attempt_status_deadline_idx] ON [dbo].[Attempt];

-- DropIndex
DROP INDEX [Exam_classId_status_idx] ON [dbo].[Exam];

-- DropIndex
DROP INDEX [User_staffRoleId_idx] ON [dbo].[User];

-- AlterTable
ALTER TABLE [dbo].[AppSetting] DROP CONSTRAINT [AppSetting_autosave_df],
[AppSetting_currency_df],
[AppSetting_kiosk_df],
[AppSetting_origins_df],
[AppSetting_remote_df],
[AppSetting_timezone_df];
ALTER TABLE [dbo].[AppSetting] ADD CONSTRAINT [AppSetting_allowedOrigins_df] DEFAULT '' FOR [allowedOrigins], CONSTRAINT [AppSetting_autosaveSeconds_df] DEFAULT 5 FOR [autosaveSeconds], CONSTRAINT [AppSetting_defaultCurrency_df] DEFAULT 'NGN' FOR [defaultCurrency], CONSTRAINT [AppSetting_kioskFullscreen_df] DEFAULT 1 FOR [kioskFullscreen], CONSTRAINT [AppSetting_remoteEnabled_df] DEFAULT 0 FOR [remoteEnabled], CONSTRAINT [AppSetting_timeZone_df] DEFAULT 'Africa/Lagos' FOR [timeZone];
ALTER TABLE [dbo].[AppSetting] ADD [activeSessionId] NVARCHAR(64),
[activeTermId] NVARCHAR(64),
[address] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_address_df] DEFAULT '',
[contactEmail] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_contactEmail_df] DEFAULT '',
[contactPhone] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_contactPhone_df] DEFAULT '',
[gradingScale] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_gradingScale_df] DEFAULT '[{"grade":"A","min":70,"remark":"Excellent"},{"grade":"B","min":60,"remark":"Very good"},{"grade":"C","min":50,"remark":"Good"},{"grade":"D","min":45,"remark":"Fair"},{"grade":"E","min":40,"remark":"Pass"},{"grade":"F","min":0,"remark":"Needs improvement"}]',
[logoPath] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_logoPath_df] DEFAULT '',
[passingMark] INT NOT NULL CONSTRAINT [AppSetting_passingMark_df] DEFAULT 40,
[principalName] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_principalName_df] DEFAULT '',
[principalSignaturePath] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_principalSignaturePath_df] DEFAULT '',
[syncEnabled] BIT NOT NULL CONSTRAINT [AppSetting_syncEnabled_df] DEFAULT 0,
[watermarkPath] NVARCHAR(max) NOT NULL CONSTRAINT [AppSetting_watermarkPath_df] DEFAULT '';

-- AlterTable
ALTER TABLE [dbo].[Attempt] ALTER COLUMN [status] NVARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Attendance] ALTER COLUMN [status] NVARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE [dbo].[Exam] ALTER COLUMN [title] NVARCHAR(200) NOT NULL;
ALTER TABLE [dbo].[Exam] ALTER COLUMN [status] NVARCHAR(32) NOT NULL;
ALTER TABLE [dbo].[Exam] ADD [assessmentLabel] NVARCHAR(max) NOT NULL CONSTRAINT [Exam_assessmentLabel_df] DEFAULT 'FINAL_EXAM',
[autoSubmit] BIT NOT NULL CONSTRAINT [Exam_autoSubmit_df] DEFAULT 1,
[subjectId] NVARCHAR(64),
[termId] NVARCHAR(64),
[timed] BIT NOT NULL CONSTRAINT [Exam_timed_df] DEFAULT 1;

-- AlterTable
ALTER TABLE [dbo].[Question] ADD [correctText] NVARCHAR(max),
[type] NVARCHAR(max) NOT NULL CONSTRAINT [Question_type_df] DEFAULT 'MCQ';

-- AlterTable
ALTER TABLE [dbo].[StudentResponse] ALTER COLUMN [optionId] NVARCHAR(64) NULL;
ALTER TABLE [dbo].[StudentResponse] ADD [feedback] NVARCHAR(max) NOT NULL CONSTRAINT [StudentResponse_feedback_df] DEFAULT '',
[manualScore] INT,
[responseText] NVARCHAR(max);

-- CreateTable
CREATE TABLE [dbo].[AcademicSession] (
    [id] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [AcademicSession_active_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AcademicSession_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AcademicSession_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AcademicSession_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Term] (
    [id] NVARCHAR(64) NOT NULL,
    [sessionId] NVARCHAR(64) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [position] INT NOT NULL,
    [startsAt] DATETIME2 NOT NULL,
    [endsAt] DATETIME2 NOT NULL,
    [active] BIT NOT NULL CONSTRAINT [Term_active_df] DEFAULT 0,
    CONSTRAINT [Term_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Term_sessionId_name_key] UNIQUE NONCLUSTERED ([sessionId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[Subject] (
    [id] NVARCHAR(64) NOT NULL,
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(150) NOT NULL,
    [core] BIT NOT NULL CONSTRAINT [Subject_core_df] DEFAULT 0,
    CONSTRAINT [Subject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Subject_code_key] UNIQUE NONCLUSTERED ([code]),
    CONSTRAINT [Subject_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[ClassSubject] (
    [id] NVARCHAR(64) NOT NULL,
    [classId] NVARCHAR(64) NOT NULL,
    [subjectId] NVARCHAR(64) NOT NULL,
    [teacherId] NVARCHAR(64),
    CONSTRAINT [ClassSubject_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ClassSubject_classId_subjectId_key] UNIQUE NONCLUSTERED ([classId],[subjectId])
);

-- CreateTable
CREATE TABLE [dbo].[StaffProfile] (
    [userId] NVARCHAR(64) NOT NULL,
    [employeeNumber] NVARCHAR(50) NOT NULL,
    [phone] NVARCHAR(max) NOT NULL CONSTRAINT [StaffProfile_phone_df] DEFAULT '',
    [address] NVARCHAR(max) NOT NULL CONSTRAINT [StaffProfile_address_df] DEFAULT '',
    [qualifications] NVARCHAR(max) NOT NULL,
    [salaryMinor] INT,
    [payrollStatus] NVARCHAR(max) NOT NULL CONSTRAINT [StaffProfile_payrollStatus_df] DEFAULT 'NOT_CONFIGURED',
    [hiredAt] DATETIME2,
    CONSTRAINT [StaffProfile_pkey] PRIMARY KEY CLUSTERED ([userId]),
    CONSTRAINT [StaffProfile_employeeNumber_key] UNIQUE NONCLUSTERED ([employeeNumber])
);

-- CreateTable
CREATE TABLE [dbo].[StaffClass] (
    [staffId] NVARCHAR(64) NOT NULL,
    [classId] NVARCHAR(64) NOT NULL,
    CONSTRAINT [StaffClass_pkey] PRIMARY KEY CLUSTERED ([staffId],[classId])
);

-- CreateTable
CREATE TABLE [dbo].[StoredFile] (
    [id] NVARCHAR(64) NOT NULL,
    [storageName] NVARCHAR(100) NOT NULL,
    [originalName] NVARCHAR(max) NOT NULL,
    [mimeType] NVARCHAR(max) NOT NULL,
    [size] INT NOT NULL,
    [purpose] NVARCHAR(max) NOT NULL,
    [createdById] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StoredFile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StoredFile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [StoredFile_storageName_key] UNIQUE NONCLUSTERED ([storageName])
);

-- CreateTable
CREATE TABLE [dbo].[Assignment] (
    [id] NVARCHAR(64) NOT NULL,
    [classSubjectId] NVARCHAR(64) NOT NULL,
    [termId] NVARCHAR(64) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [instructions] NVARCHAR(max) NOT NULL,
    [releaseAt] DATETIME2 NOT NULL,
    [dueAt] DATETIME2 NOT NULL,
    [maxScore] INT NOT NULL,
    [published] BIT NOT NULL CONSTRAINT [Assignment_published_df] DEFAULT 0,
    [createdById] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Assignment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Assignment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AssignmentAttachment] (
    [assignmentId] NVARCHAR(64) NOT NULL,
    [fileId] NVARCHAR(64) NOT NULL,
    CONSTRAINT [AssignmentAttachment_pkey] PRIMARY KEY CLUSTERED ([assignmentId],[fileId])
);

-- CreateTable
CREATE TABLE [dbo].[AssignmentSubmission] (
    [id] NVARCHAR(64) NOT NULL,
    [assignmentId] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [text] NVARCHAR(max) NOT NULL CONSTRAINT [AssignmentSubmission_text_df] DEFAULT '',
    [submittedAt] DATETIME2 NOT NULL CONSTRAINT [AssignmentSubmission_submittedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [score] INT,
    [feedback] NVARCHAR(max) NOT NULL CONSTRAINT [AssignmentSubmission_feedback_df] DEFAULT '',
    [gradedAt] DATETIME2,
    [gradedById] NVARCHAR(64),
    CONSTRAINT [AssignmentSubmission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AssignmentSubmission_assignmentId_studentId_key] UNIQUE NONCLUSTERED ([assignmentId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[SubmissionFile] (
    [submissionId] NVARCHAR(64) NOT NULL,
    [fileId] NVARCHAR(64) NOT NULL,
    CONSTRAINT [SubmissionFile_pkey] PRIMARY KEY CLUSTERED ([submissionId],[fileId])
);

-- CreateTable
CREATE TABLE [dbo].[StudyMaterial] (
    [id] NVARCHAR(64) NOT NULL,
    [classSubjectId] NVARCHAR(64) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [description] NVARCHAR(max) NOT NULL CONSTRAINT [StudyMaterial_description_df] DEFAULT '',
    [fileId] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StudyMaterial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StudyMaterial_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CourseRubric] (
    [id] NVARCHAR(64) NOT NULL,
    [classSubjectId] NVARCHAR(64) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CourseRubric_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CourseRubric_classSubjectId_key] UNIQUE NONCLUSTERED ([classSubjectId])
);

-- CreateTable
CREATE TABLE [dbo].[RubricComponent] (
    [id] NVARCHAR(64) NOT NULL,
    [rubricId] NVARCHAR(64) NOT NULL,
    [key] NVARCHAR(30) NOT NULL,
    [label] NVARCHAR(max) NOT NULL,
    [weight] INT NOT NULL,
    CONSTRAINT [RubricComponent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RubricComponent_rubricId_key_key] UNIQUE NONCLUSTERED ([rubricId],[key])
);

-- CreateTable
CREATE TABLE [dbo].[GradeEntry] (
    [id] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [classSubjectId] NVARCHAR(64) NOT NULL,
    [termId] NVARCHAR(64) NOT NULL,
    [componentKey] NVARCHAR(30) NOT NULL,
    [title] NVARCHAR(200) NOT NULL,
    [score] INT NOT NULL,
    [maxScore] INT NOT NULL,
    [comment] NVARCHAR(max) NOT NULL CONSTRAINT [GradeEntry_comment_df] DEFAULT '',
    [teacherId] NVARCHAR(64) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [GradeEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [GradeEntry_studentId_classSubjectId_termId_componentKey_title_key] UNIQUE NONCLUSTERED ([studentId],[classSubjectId],[termId],[componentKey],[title])
);

-- CreateTable
CREATE TABLE [dbo].[PromotionRule] (
    [id] NVARCHAR(64) NOT NULL,
    [sessionId] NVARCHAR(64) NOT NULL,
    [sourceClassId] NVARCHAR(64) NOT NULL,
    [targetClassId] NVARCHAR(64) NOT NULL,
    [minimumAverage] INT NOT NULL,
    [coreSubjectMinimum] INT NOT NULL,
    [maximumFailedCore] INT NOT NULL CONSTRAINT [PromotionRule_maximumFailedCore_df] DEFAULT 0,
    CONSTRAINT [PromotionRule_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PromotionRule_sessionId_sourceClassId_key] UNIQUE NONCLUSTERED ([sessionId],[sourceClassId])
);

-- CreateTable
CREATE TABLE [dbo].[PromotionRun] (
    [id] NVARCHAR(64) NOT NULL,
    [sessionId] NVARCHAR(64) NOT NULL,
    [status] NVARCHAR(32) NOT NULL CONSTRAINT [PromotionRun_status_df] DEFAULT 'PREVIEW',
    [createdById] NVARCHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PromotionRun_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [appliedAt] DATETIME2,
    CONSTRAINT [PromotionRun_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PromotionDecision] (
    [id] NVARCHAR(64) NOT NULL,
    [runId] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [fromClassId] NVARCHAR(64) NOT NULL,
    [toClassId] NVARCHAR(64),
    [average] INT NOT NULL,
    [failedCore] INT NOT NULL,
    [outcome] NVARCHAR(max) NOT NULL,
    [reason] NVARCHAR(max) NOT NULL,
    CONSTRAINT [PromotionDecision_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PromotionDecision_runId_studentId_key] UNIQUE NONCLUSTERED ([runId],[studentId])
);

-- CreateTable
CREATE TABLE [dbo].[ReportComment] (
    [id] NVARCHAR(64) NOT NULL,
    [studentId] NVARCHAR(64) NOT NULL,
    [termId] NVARCHAR(64) NOT NULL,
    [teacherComment] NVARCHAR(max) NOT NULL CONSTRAINT [ReportComment_teacherComment_df] DEFAULT '',
    [principalComment] NVARCHAR(max) NOT NULL CONSTRAINT [ReportComment_principalComment_df] DEFAULT '',
    [authorId] NVARCHAR(64) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [ReportComment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ReportComment_studentId_termId_key] UNIQUE NONCLUSTERED ([studentId],[termId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Exam_classId_status_idx] ON [dbo].[Exam]([classId], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Attempt_status_deadline_idx] ON [dbo].[Attempt]([status], [deadline]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ClassSubject_teacherId_idx] ON [dbo].[ClassSubject]([teacherId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Assignment_classSubjectId_termId_idx] ON [dbo].[Assignment]([classSubjectId], [termId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GradeEntry_classSubjectId_termId_idx] ON [dbo].[GradeEntry]([classSubjectId], [termId]);

-- RenameForeignKey
EXEC sp_rename 'dbo.StaffRoleGrant_role_fk', 'StaffRoleGrant_staffRoleId_fkey', 'OBJECT';

-- RenameForeignKey
EXEC sp_rename 'dbo.User_staffRole_fk', 'User_staffRoleId_fkey', 'OBJECT';

-- AddForeignKey
ALTER TABLE [dbo].[Exam] ADD CONSTRAINT [Exam_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [dbo].[Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Exam] ADD CONSTRAINT [Exam_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[Subject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Term] ADD CONSTRAINT [Term_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AcademicSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ClassSubject] ADD CONSTRAINT [ClassSubject_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ClassSubject] ADD CONSTRAINT [ClassSubject_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [dbo].[Subject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ClassSubject] ADD CONSTRAINT [ClassSubject_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StaffProfile] ADD CONSTRAINT [StaffProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StaffClass] ADD CONSTRAINT [StaffClass_staffId_fkey] FOREIGN KEY ([staffId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StaffClass] ADD CONSTRAINT [StaffClass_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Assignment] ADD CONSTRAINT [Assignment_classSubjectId_fkey] FOREIGN KEY ([classSubjectId]) REFERENCES [dbo].[ClassSubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Assignment] ADD CONSTRAINT [Assignment_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [dbo].[Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AssignmentAttachment] ADD CONSTRAINT [AssignmentAttachment_assignmentId_fkey] FOREIGN KEY ([assignmentId]) REFERENCES [dbo].[Assignment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AssignmentAttachment] ADD CONSTRAINT [AssignmentAttachment_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AssignmentSubmission] ADD CONSTRAINT [AssignmentSubmission_assignmentId_fkey] FOREIGN KEY ([assignmentId]) REFERENCES [dbo].[Assignment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AssignmentSubmission] ADD CONSTRAINT [AssignmentSubmission_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SubmissionFile] ADD CONSTRAINT [SubmissionFile_submissionId_fkey] FOREIGN KEY ([submissionId]) REFERENCES [dbo].[AssignmentSubmission]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[SubmissionFile] ADD CONSTRAINT [SubmissionFile_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudyMaterial] ADD CONSTRAINT [StudyMaterial_classSubjectId_fkey] FOREIGN KEY ([classSubjectId]) REFERENCES [dbo].[ClassSubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StudyMaterial] ADD CONSTRAINT [StudyMaterial_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [dbo].[StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CourseRubric] ADD CONSTRAINT [CourseRubric_classSubjectId_fkey] FOREIGN KEY ([classSubjectId]) REFERENCES [dbo].[ClassSubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RubricComponent] ADD CONSTRAINT [RubricComponent_rubricId_fkey] FOREIGN KEY ([rubricId]) REFERENCES [dbo].[CourseRubric]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GradeEntry] ADD CONSTRAINT [GradeEntry_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GradeEntry] ADD CONSTRAINT [GradeEntry_classSubjectId_fkey] FOREIGN KEY ([classSubjectId]) REFERENCES [dbo].[ClassSubject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GradeEntry] ADD CONSTRAINT [GradeEntry_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [dbo].[Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GradeEntry] ADD CONSTRAINT [GradeEntry_teacherId_fkey] FOREIGN KEY ([teacherId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionRule] ADD CONSTRAINT [PromotionRule_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AcademicSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionRule] ADD CONSTRAINT [PromotionRule_sourceClassId_fkey] FOREIGN KEY ([sourceClassId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionRule] ADD CONSTRAINT [PromotionRule_targetClassId_fkey] FOREIGN KEY ([targetClassId]) REFERENCES [dbo].[Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionRun] ADD CONSTRAINT [PromotionRun_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AcademicSession]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionDecision] ADD CONSTRAINT [PromotionDecision_runId_fkey] FOREIGN KEY ([runId]) REFERENCES [dbo].[PromotionRun]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PromotionDecision] ADD CONSTRAINT [PromotionDecision_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReportComment] ADD CONSTRAINT [ReportComment_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReportComment] ADD CONSTRAINT [ReportComment_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [dbo].[Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReportComment] ADD CONSTRAINT [ReportComment_authorId_fkey] FOREIGN KEY ([authorId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
