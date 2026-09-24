INSERT INTO "StaffRoleGrant" ("staffRoleId","permission")
SELECT "id", 'LIBRARY_MANAGE' FROM "StaffRole" WHERE "name"='Teacher'
ON CONFLICT ("staffRoleId","permission") DO NOTHING;
