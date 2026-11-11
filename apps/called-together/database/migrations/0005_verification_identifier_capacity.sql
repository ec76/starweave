-- Better Auth 1.7.18 uses ordinary UUIDs (36 characters) AND deterministic
-- SHA-256 reservation IDs (43 unpadded base64url characters) with our custom
-- generateId function. forceAllowId preserves those reservation IDs.
-- No table in 0001-0004 references AuthVerifications.id. All user/session/account
-- IDs and their foreign keys remain UUID-sized; do not truncate or rewrite IDs.
-- The migration runner executes this constraint/index change transactionally.
ALTER TABLE dbo.AuthVerifications DROP CONSTRAINT PK_AuthVerifications;
ALTER TABLE dbo.AuthVerifications ALTER COLUMN id nvarchar(43) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE dbo.AuthVerifications ADD CONSTRAINT PK_AuthVerifications PRIMARY KEY (id);
