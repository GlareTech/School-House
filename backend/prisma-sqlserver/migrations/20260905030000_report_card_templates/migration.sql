ALTER TABLE [ReportComment] ADD
  [templateKey] NVARCHAR(40) NOT NULL CONSTRAINT [ReportComment_templateKey_df] DEFAULT 'CLASSIC',
  [affectiveRatings] NVARCHAR(MAX) NOT NULL CONSTRAINT [ReportComment_affectiveRatings_df] DEFAULT '{}',
  [psychomotorRatings] NVARCHAR(MAX) NOT NULL CONSTRAINT [ReportComment_psychomotorRatings_df] DEFAULT '{}',
  [reportMetadata] NVARCHAR(MAX) NOT NULL CONSTRAINT [ReportComment_reportMetadata_df] DEFAULT '{}',
  [published] BIT NOT NULL CONSTRAINT [ReportComment_published_df] DEFAULT 0;
