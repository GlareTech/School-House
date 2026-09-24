ALTER TABLE [User] ADD [staffRoleId] NVARCHAR(64) NULL;
ALTER TABLE [User] DROP CONSTRAINT [User_role_check];
ALTER TABLE [User] ADD CONSTRAINT [User_role_check] CHECK ([role] IN ('ADMIN','STAFF','STUDENT'));

CREATE TABLE [StaffRole] (
  [id] NVARCHAR(64) NOT NULL,
  [name] NVARCHAR(150) NOT NULL,
  [description] NVARCHAR(MAX) NOT NULL CONSTRAINT [StaffRole_description_df] DEFAULT '',
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [StaffRole_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [StaffRole_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [StaffRole_name_key] UNIQUE NONCLUSTERED ([name])
);
CREATE TABLE [StaffRoleGrant] (
  [staffRoleId] NVARCHAR(64) NOT NULL,
  [permission] NVARCHAR(64) NOT NULL,
  CONSTRAINT [StaffRoleGrant_pkey] PRIMARY KEY CLUSTERED ([staffRoleId],[permission]),
  CONSTRAINT [StaffRoleGrant_role_fk] FOREIGN KEY ([staffRoleId]) REFERENCES [StaffRole]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
);
ALTER TABLE [User] ADD CONSTRAINT [User_staffRole_fk] FOREIGN KEY ([staffRoleId]) REFERENCES [StaffRole]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX [User_staffRoleId_idx] ON [User]([staffRoleId]);

CREATE TABLE [AppSetting] (
  [id] NVARCHAR(64) NOT NULL CONSTRAINT [AppSetting_id_df] DEFAULT 'global',
  [schoolName] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_schoolName_df] DEFAULT 'Schoolhouse',
  [shortName] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_shortName_df] DEFAULT 'SH',
  [tagline] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_tagline_df] DEFAULT 'Your school. Connected.',
  [primaryColor] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_primaryColor_df] DEFAULT '#103d36',
  [accentColor] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_accentColor_df] DEFAULT '#e9f2c8',
  [academicYear] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_academicYear_df] DEFAULT '',
  [currentTerm] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_currentTerm_df] DEFAULT '',
  [defaultCurrency] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_currency_df] DEFAULT 'NGN',
  [locale] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_locale_df] DEFAULT 'en-NG',
  [timeZone] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_timezone_df] DEFAULT 'Africa/Lagos',
  [autosaveSeconds] INT NOT NULL CONSTRAINT [AppSetting_autosave_df] DEFAULT 5,
  [kioskFullscreen] BIT NOT NULL CONSTRAINT [AppSetting_kiosk_df] DEFAULT 1,
  [remoteEnabled] BIT NOT NULL CONSTRAINT [AppSetting_remote_df] DEFAULT 0,
  [remoteUrl] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_remoteUrl_df] DEFAULT '',
  [allowedOrigins] NVARCHAR(MAX) NOT NULL CONSTRAINT [AppSetting_origins_df] DEFAULT '',
  [updatedAt] DATETIME2 NOT NULL,
  CONSTRAINT [AppSetting_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [AppSetting_autosave_check] CHECK ([autosaveSeconds] BETWEEN 3 AND 30)
);
