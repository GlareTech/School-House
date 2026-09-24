ALTER TABLE [dbo].[AppSetting] DROP CONSTRAINT IF EXISTS [AppSetting_remote_df];
ALTER TABLE [dbo].[AppSetting] DROP CONSTRAINT IF EXISTS [AppSetting_remoteUrl_df];
ALTER TABLE [dbo].[AppSetting] DROP CONSTRAINT IF EXISTS [AppSetting_allowedOrigins_df];
ALTER TABLE [dbo].[AppSetting] DROP COLUMN [remoteEnabled], [remoteUrl], [allowedOrigins];
