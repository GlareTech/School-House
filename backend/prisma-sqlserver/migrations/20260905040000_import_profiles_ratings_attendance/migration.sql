ALTER TABLE [User] ADD
  [phone] NVARCHAR(50) NOT NULL CONSTRAINT [User_phone_df] DEFAULT '',
  [address] NVARCHAR(MAX) NOT NULL CONSTRAINT [User_address_df] DEFAULT '',
  [dateOfBirth] DATE NULL,
  [gender] NVARCHAR(30) NOT NULL CONSTRAINT [User_gender_df] DEFAULT '',
  [emergencyContactName] NVARCHAR(150) NOT NULL CONSTRAINT [User_emergencyContactName_df] DEFAULT '',
  [emergencyContactPhone] NVARCHAR(50) NOT NULL CONSTRAINT [User_emergencyContactPhone_df] DEFAULT '',
  [emergencyRelationship] NVARCHAR(80) NOT NULL CONSTRAINT [User_emergencyRelationship_df] DEFAULT '',
  [medicalInformation] NVARCHAR(MAX) NOT NULL CONSTRAINT [User_medicalInformation_df] DEFAULT '',
  [lastLoginAt] DATETIME2 NULL;

ALTER TABLE [Class] ADD [classTeacherId] NVARCHAR(64) NULL;
ALTER TABLE [Attendance] ADD
  [source] NVARCHAR(20) NOT NULL CONSTRAINT [Attendance_source_df] DEFAULT 'STAFF',
  [reviewStatus] NVARCHAR(20) NOT NULL CONSTRAINT [Attendance_reviewStatus_df] DEFAULT 'APPROVED';

CREATE TABLE [AttendanceWindow] (
  [id] NVARCHAR(64) NOT NULL,
  [classId] NVARCHAR(64) NOT NULL,
  [date] DATE NOT NULL,
  [status] NVARCHAR(20) NOT NULL CONSTRAINT [AttendanceWindow_status_df] DEFAULT 'OPEN',
  [closesAt] DATETIME2 NOT NULL,
  [openedById] NVARCHAR(64) NOT NULL,
  [approvedById] NVARCHAR(64) NULL,
  [approvedAt] DATETIME2 NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [AttendanceWindow_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  [updatedAt] DATETIME2 NOT NULL,
  CONSTRAINT [AttendanceWindow_pkey] PRIMARY KEY ([id]),
  CONSTRAINT [AttendanceWindow_class_date_key] UNIQUE ([classId],[date])
);

CREATE TABLE [StudentRating] (
  [id] NVARCHAR(64) NOT NULL,
  [studentId] NVARCHAR(64) NOT NULL,
  [termId] NVARCHAR(64) NOT NULL,
  [category] NVARCHAR(30) NOT NULL,
  [ratings] NVARCHAR(MAX) NOT NULL,
  [comment] NVARCHAR(MAX) NOT NULL CONSTRAINT [StudentRating_comment_df] DEFAULT '',
  [ratedById] NVARCHAR(64) NOT NULL,
  [updatedAt] DATETIME2 NOT NULL,
  CONSTRAINT [StudentRating_pkey] PRIMARY KEY ([id]),
  CONSTRAINT [StudentRating_student_term_category_key] UNIQUE ([studentId],[termId],[category])
);

CREATE INDEX [Class_classTeacherId_idx] ON [Class]([classTeacherId]);
CREATE INDEX [AttendanceWindow_date_status_idx] ON [AttendanceWindow]([date],[status]);
CREATE INDEX [StudentRating_term_category_idx] ON [StudentRating]([termId],[category]);
ALTER TABLE [Class] ADD CONSTRAINT [Class_classTeacherId_fkey] FOREIGN KEY ([classTeacherId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [AttendanceWindow] ADD CONSTRAINT [AttendanceWindow_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [AttendanceWindow] ADD CONSTRAINT [AttendanceWindow_openedById_fkey] FOREIGN KEY ([openedById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [AttendanceWindow] ADD CONSTRAINT [AttendanceWindow_approvedById_fkey] FOREIGN KEY ([approvedById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [StudentRating] ADD CONSTRAINT [StudentRating_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [StudentRating] ADD CONSTRAINT [StudentRating_termId_fkey] FOREIGN KEY ([termId]) REFERENCES [Term]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [StudentRating] ADD CONSTRAINT [StudentRating_ratedById_fkey] FOREIGN KEY ([ratedById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
