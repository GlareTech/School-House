ALTER TABLE [AppSetting] ADD [hostelEnabled] BIT NOT NULL CONSTRAINT [AppSetting_hostelEnabled_df] DEFAULT 0;

CREATE TABLE [Hostel] (
  [id] NVARCHAR(64) NOT NULL,
  [name] NVARCHAR(150) NOT NULL,
  [genderPolicy] NVARCHAR(20) NOT NULL CONSTRAINT [Hostel_genderPolicy_df] DEFAULT 'MIXED',
  [address] NVARCHAR(MAX) NOT NULL CONSTRAINT [Hostel_address_df] DEFAULT '',
  [active] BIT NOT NULL CONSTRAINT [Hostel_active_df] DEFAULT 1,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [Hostel_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [Hostel_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [Hostel_name_key] UNIQUE NONCLUSTERED ([name])
);

CREATE TABLE [HostelRoom] (
  [id] NVARCHAR(64) NOT NULL,
  [hostelId] NVARCHAR(64) NOT NULL,
  [name] NVARCHAR(100) NOT NULL,
  [floor] NVARCHAR(50) NOT NULL CONSTRAINT [HostelRoom_floor_df] DEFAULT '',
  [capacity] INT NOT NULL,
  [active] BIT NOT NULL CONSTRAINT [HostelRoom_active_df] DEFAULT 1,
  CONSTRAINT [HostelRoom_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [HostelRoom_hostelId_name_key] UNIQUE NONCLUSTERED ([hostelId],[name])
);
CREATE NONCLUSTERED INDEX [HostelRoom_hostelId_idx] ON [HostelRoom]([hostelId]);

CREATE TABLE [HostelBed] (
  [id] NVARCHAR(64) NOT NULL,
  [roomId] NVARCHAR(64) NOT NULL,
  [label] NVARCHAR(50) NOT NULL,
  [active] BIT NOT NULL CONSTRAINT [HostelBed_active_df] DEFAULT 1,
  CONSTRAINT [HostelBed_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [HostelBed_roomId_label_key] UNIQUE NONCLUSTERED ([roomId],[label])
);
CREATE NONCLUSTERED INDEX [HostelBed_roomId_idx] ON [HostelBed]([roomId]);

CREATE TABLE [HostelAllocation] (
  [id] NVARCHAR(64) NOT NULL,
  [studentId] NVARCHAR(64) NOT NULL,
  [bedId] NVARCHAR(64) NOT NULL,
  [status] NVARCHAR(20) NOT NULL CONSTRAINT [HostelAllocation_status_df] DEFAULT 'ACTIVE',
  [startsAt] DATETIME2 NOT NULL CONSTRAINT [HostelAllocation_startsAt_df] DEFAULT CURRENT_TIMESTAMP,
  [endsAt] DATETIME2 NULL,
  [notes] NVARCHAR(MAX) NOT NULL CONSTRAINT [HostelAllocation_notes_df] DEFAULT '',
  [allocatedById] NVARCHAR(64) NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [HostelAllocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT [HostelAllocation_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [HostelAllocation_studentId_status_idx] ON [HostelAllocation]([studentId],[status]);
CREATE NONCLUSTERED INDEX [HostelAllocation_bedId_status_idx] ON [HostelAllocation]([bedId],[status]);

ALTER TABLE [HostelRoom] ADD CONSTRAINT [HostelRoom_hostelId_fkey] FOREIGN KEY ([hostelId]) REFERENCES [Hostel]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [HostelBed] ADD CONSTRAINT [HostelBed_roomId_fkey] FOREIGN KEY ([roomId]) REFERENCES [HostelRoom]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [HostelAllocation] ADD CONSTRAINT [HostelAllocation_studentId_fkey] FOREIGN KEY ([studentId]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [HostelAllocation] ADD CONSTRAINT [HostelAllocation_bedId_fkey] FOREIGN KEY ([bedId]) REFERENCES [HostelBed]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [HostelAllocation] ADD CONSTRAINT [HostelAllocation_allocatedById_fkey] FOREIGN KEY ([allocatedById]) REFERENCES [User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;