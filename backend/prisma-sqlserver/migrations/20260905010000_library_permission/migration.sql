INSERT INTO [StaffRoleGrant] ([staffRoleId],[permission])
SELECT [id], 'LIBRARY_MANAGE' FROM [StaffRole] r
WHERE r.[name]='Teacher' AND NOT EXISTS (
  SELECT 1 FROM [StaffRoleGrant] g WHERE g.[staffRoleId]=r.[id] AND g.[permission]='LIBRARY_MANAGE'
);
