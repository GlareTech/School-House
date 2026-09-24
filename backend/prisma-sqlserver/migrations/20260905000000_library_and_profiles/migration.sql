ALTER TABLE [User] ADD [profilePictureId] NVARCHAR(64) NULL;
EXEC(N'CREATE UNIQUE INDEX [User_profilePictureId_key] ON [User]([profilePictureId]) WHERE [profilePictureId] IS NOT NULL');

CREATE TABLE [LibraryMaterial] (
  [id] NVARCHAR(64) NOT NULL,
  [title] NVARCHAR(200) NOT NULL,
  [description] NVARCHAR(MAX) NOT NULL CONSTRAINT [LibraryMaterial_description_df] DEFAULT '',
  [author] NVARCHAR(150) NOT NULL CONSTRAINT [LibraryMaterial_author_df] DEFAULT '',
  [category] NVARCHAR(100) NOT NULL CONSTRAINT [LibraryMaterial_category_df] DEFAULT '',
  [fileId] NVARCHAR(64) NOT NULL,
  [classId] NVARCHAR(64) NULL,
  [subjectId] NVARCHAR(64) NULL,
  [uploadedById] NVARCHAR(64) NOT NULL,
  [published] BIT NOT NULL CONSTRAINT [LibraryMaterial_published_df] DEFAULT 1,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [LibraryMaterial_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [LibraryMaterial_pkey] PRIMARY KEY ([id]),
  CONSTRAINT [LibraryMaterial_fileId_fkey] FOREIGN KEY ([fileId]) REFERENCES [StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [LibraryMaterial_classId_fkey] FOREIGN KEY ([classId]) REFERENCES [Class]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [LibraryMaterial_subjectId_fkey] FOREIGN KEY ([subjectId]) REFERENCES [Subject]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT [LibraryMaterial_uploadedById_fkey] FOREIGN KEY ([uploadedById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX [LibraryMaterial_classId_subjectId_published_idx] ON [LibraryMaterial]([classId], [subjectId], [published]);
CREATE INDEX [LibraryMaterial_createdAt_idx] ON [LibraryMaterial]([createdAt]);
EXEC(N'ALTER TABLE [User] ADD CONSTRAINT [User_profilePictureId_fkey] FOREIGN KEY ([profilePictureId]) REFERENCES [StoredFile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION');
