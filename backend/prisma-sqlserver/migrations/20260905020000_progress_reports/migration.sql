CREATE TABLE [ProgressReport] (
  [id] NVARCHAR(64) NOT NULL,
  [studentId] NVARCHAR(64) NOT NULL,
  [termId] NVARCHAR(64) NOT NULL,
  [reportType] NVARCHAR(20) NOT NULL CONSTRAINT [ProgressReport_reportType_df] DEFAULT 'MID_TERM',
  [title] NVARCHAR(200) NOT NULL CONSTRAINT [ProgressReport_title_df] DEFAULT 'MID-TERM PROGRESS REPORT',
  [rows] NVARCHAR(MAX) NOT NULL,
  [traits] NVARCHAR(MAX) NOT NULL,
  [teacherComment] NVARCHAR(MAX) NOT NULL CONSTRAINT [ProgressReport_teacherComment_df] DEFAULT '',
  [administratorComment] NVARCHAR(MAX) NOT NULL CONSTRAINT [ProgressReport_administratorComment_df] DEFAULT '',
  [signedBy] NVARCHAR(150) NOT NULL CONSTRAINT [ProgressReport_signedBy_df] DEFAULT '',
  [reportDate] DATE NOT NULL,
  [status] NVARCHAR(20) NOT NULL CONSTRAINT [ProgressReport_status_df] DEFAULT 'DRAFT',
  [createdById] NVARCHAR(64) NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProgressReport_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL,
  CONSTRAINT [ProgressReport_pkey] PRIMARY KEY ([id]),
  CONSTRAINT [ProgressReport_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [ProgressReport_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [ProgressReport_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [ProgressReport_studentId_termId_reportType_key] UNIQUE ([studentId],[termId],[reportType])
);
CREATE INDEX [ProgressReport_termId_status_idx] ON [ProgressReport]([termId],[status]);
