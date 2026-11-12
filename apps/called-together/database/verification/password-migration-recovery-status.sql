-- Owner-run READ-ONLY inspection after the failed 0006 attempt.
-- Run as an existing owner with full metadata visibility, before any retry.
-- This script neither repairs objects nor executes the migration batch.
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'ct_password_auth_test'
    THROW 53300, 'Wrong disposable database.', 1;
DECLARE @entryTransactions int, @entryState int, @entryImplicit int;
SET @entryTransactions = @@TRANCOUNT;
SET @entryState = XACT_STATE();
SET @entryImplicit = CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
-- Report stored values only: SELECT can observe its own statement transaction.
SELECT @@SPID AS SessionId, DB_NAME() AS CurrentDatabase,
    @entryTransactions AS EntryOpenTransactions, @entryState AS EntryTransactionState,
    @entryImplicit AS ImplicitTransactionsEnabled;
IF @entryTransactions <> 0 OR @entryState <> 0
    THROW 53304, 'An existing transaction is present. Stop for owner review; no transaction was ended by this script.', 1;
IF @entryImplicit <> 0
    THROW 53303, 'Implicit transactions are enabled. Use a clean autocommit connection; no transaction was ended by this script.', 1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'VIEW DEFINITION'), 0) <> 1
    THROW 53301, 'Full database metadata visibility is required; use the existing owner identity.', 1;
IF OBJECT_ID(N'dbo.CalledTogetherMigrations', N'U') IS NULL
    THROW 53302, 'Migration history is missing. Stop and inspect the target.', 1;

SELECT Version, Filename, Checksum, AppliedAt
FROM dbo.CalledTogetherMigrations ORDER BY Version;

-- Metadata only: no account, password, session or verification values.
SELECT c.name AS ColumnName, TYPE_NAME(c.user_type_id) AS SqlType,
    c.max_length AS MaxBytes, c.collation_name AS ColumnCollation
FROM sys.columns c
WHERE c.object_id = OBJECT_ID(N'dbo.AuthAccounts', N'U')
    AND c.name IN (N'accountId', N'userId', N'providerId');

-- APPLOCK_TEST only tests grantability; it never acquires a lock to release.
-- It is advisory: the migration runner must still acquire its own exclusive lock.
DECLARE @lockAvailable int, @inspectionTransactions int, @inspectionState int;
SET @lockAvailable = CASE WHEN
    APPLOCK_MODE(N'public', N'CalledTogether:editorial:migrations', N'Session') = N'NoLock'
    AND APPLOCK_TEST(N'public', N'CalledTogether:editorial:migrations', N'Exclusive', N'Session') = 1 THEN 1 ELSE 0 END;
-- Sample between statements after metadata/lock work, never in a SELECT.
SET @inspectionTransactions = @@TRANCOUNT;
SET @inspectionState = XACT_STATE();

;WITH expectedHistory(Version, Filename, Checksum) AS (
    SELECT * FROM (VALUES
      (1, N'0001_editorial_schema.sql', N'6ababa871a4679153b99c7fbb918b915491fa859b0876a76513bb64ac6b86485'),
      (2, N'0002_public_articles.sql', N'b6b92838fa0c8d029690dde5d0de172dfe29f46ac8cd6a2e0d54d15dbc27216f'),
      (3, N'0003_email_accounts.sql', N'2ae528aa634d1f0afd085c2e1c4b1be937a919e2dfb9c5a5e780cd6a9e829990'),
      (4, N'0004_email_account_operations.sql', N'30edabc68219c619e372ba71c8e376cacbedc3d37f605def3ad63db3870d9cfe'),
      (5, N'0005_verification_identifier_capacity.sql', N'ab4a8d212384f339bd36b74f35fb7d4536e0b20dad6a7a2f15233cac7af778d1')
    ) e(Version, Filename, Checksum)
), expectedProcedures(Name, DefinitionHash) AS (
    -- SHA-256 of migration 0004's decoded procedure bodies, UTF-16LE, LF.
    SELECT * FROM (VALUES
      (N'AuthManageAccount', N'235bd1ba87e398c1121ac251693f4b3513c632d5189eb454c02cadf72afcdb9b'),
      (N'AuthBootstrapAdministrator', N'1040c3ebc038d7e9c63e4ff256a00f66f609c5a132faa6022099226aeac9bb1f'),
      (N'AuthThrottle', N'da6c16ae9aeb42884d8e1c58cbb9f7febb57b933082fbc56029095acbce5b344'),
      (N'AuthBeginSession', N'19975d84a77fc3b0c0b74d02c134e2253aa0a1d93c6066ddc8e1871ca0d772b2'),
      (N'AuthRecordSessionEvent', N'752acbac9c09027079fe830d3d81b8cdad0bc15b95d1873a73b5c1d8228a95bf')
    ) p(Name, DefinitionHash)
), checks(CheckName, Passed) AS (
    SELECT N'NoOpenTransaction', CASE WHEN @entryTransactions=0 AND @entryState=0
      AND @inspectionTransactions=0 AND @inspectionState=0 THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'AutocommitMode', CASE WHEN @entryImplicit=0 THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'MigrationLockAvailable', @lockAvailable
    UNION ALL
    SELECT N'ExactlyOriginalHistory1Through5', CASE WHEN (SELECT COUNT(*) FROM dbo.CalledTogetherMigrations) = 5
      AND NOT EXISTS(SELECT 1 FROM expectedHistory e LEFT JOIN dbo.CalledTogetherMigrations h ON h.Version=e.Version
        WHERE h.Version IS NULL OR h.Filename COLLATE Latin1_General_100_BIN2 <> e.Filename COLLATE Latin1_General_100_BIN2
          OR h.Checksum COLLATE Latin1_General_100_BIN2 <> e.Checksum COLLATE Latin1_General_100_BIN2) THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'OriginalAuthTablesPresent', CASE WHEN NOT EXISTS (
      SELECT 1 FROM (VALUES(N'AuthUsers'),(N'AuthAccounts'),(N'AuthSessions'),(N'AuthVerifications'),
        (N'AuthInvitations'),(N'AuthRoleAssignments'),(N'AuthAuditEvents'),(N'AuthThrottleBuckets')) t(Name)
      WHERE OBJECT_ID(N'dbo.'+t.Name, N'U') IS NULL) THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'ActivatedAtAbsent', CASE WHEN NOT EXISTS(SELECT 1 FROM sys.columns
      WHERE object_id=OBJECT_ID(N'dbo.AuthUsers', N'U') AND name=N'activatedAt') THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'OriginalCredentialConstraintRestored', CASE WHEN EXISTS(SELECT 1 FROM sys.check_constraints
      WHERE parent_object_id=OBJECT_ID(N'dbo.AuthAccounts', N'U') AND name=N'CK_AuthAccounts_NoCredentials'
        AND is_disabled=0 AND is_not_trusted=0) THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'NewCredentialConstraintAbsent', CASE WHEN OBJECT_ID(N'dbo.CK_AuthAccounts_Credentials', N'C') IS NULL THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'NewCredentialIndexAbsent', CASE WHEN NOT EXISTS(SELECT 1 FROM sys.indexes
      WHERE object_id=OBJECT_ID(N'dbo.AuthAccounts', N'U') AND name=N'UX_AuthAccounts_CredentialUser') THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'NewTablesAbsent', CASE WHEN NOT EXISTS(
      SELECT 1 FROM (VALUES(N'AuthSetupVerifications'),(N'AuthNotifications'),(N'ActivityEvents'),(N'AuthSecurityBuckets')) t(Name)
      WHERE OBJECT_ID(N'dbo.'+t.Name) IS NOT NULL) THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'NewTriggersAbsent', CASE WHEN OBJECT_ID(N'dbo.ActivityEvents_Immutable') IS NULL
      AND OBJECT_ID(N'dbo.AuthAuditEvents_Immutable') IS NULL THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'NewProceduresAbsent', CASE WHEN NOT EXISTS(
      SELECT 1 FROM (VALUES(N'AuthCompletePassword'),(N'AuthSecurityEvent'),(N'AuthListActivity'),(N'AuthRecoverPending')) p(Name)
      WHERE OBJECT_ID(N'dbo.'+p.Name) IS NOT NULL) THEN 1 ELSE 0 END
    UNION ALL
    SELECT N'OriginalProcedureDefinitionsIntact', CASE WHEN NOT EXISTS(SELECT 1 FROM expectedProcedures p
      WHERE OBJECT_DEFINITION(OBJECT_ID(N'dbo.'+p.Name, N'P')) IS NULL
        OR LOWER(CONVERT(varchar(64), HASHBYTES('SHA2_256', REPLACE(OBJECT_DEFINITION(OBJECT_ID(N'dbo.'+p.Name, N'P')),
          NCHAR(13)+NCHAR(10), NCHAR(10))), 2)) COLLATE Latin1_General_100_BIN2 <> p.DefinitionHash COLLATE Latin1_General_100_BIN2)
      THEN 1 ELSE 0 END
)
SELECT CheckName, Passed, MIN(Passed) OVER () AS CleanUnappliedBaseline
FROM checks ORDER BY CheckName;
DECLARE @finalTransactions int, @finalState int;
SET @finalTransactions = @@TRANCOUNT;
SET @finalState = XACT_STATE();
SELECT @@SPID AS SessionId,
    @entryTransactions AS EntryOpenTransactions, @entryState AS EntryTransactionState,
    @inspectionTransactions AS InspectionOpenTransactions, @inspectionState AS InspectionTransactionState,
    @finalTransactions AS FinalOpenTransactions, @finalState AS FinalTransactionState;
IF @finalTransactions <> 0 OR @finalState <> 0
    THROW 53305, 'Inspection ended with an active transaction. Stop for owner review; no transaction was ended by this script.', 1;
-- Only all Passed=1 / CleanUnappliedBaseline=1 establishes this metadata baseline.
-- It does not establish that 0006/0007 are unapplied in OTHER databases.
-- If any check fails or times out, stop. Do not change history or remove objects.
-- This cannot prove restoration of historical session/code rows without a prior
-- snapshot; the atomic rollback path, not these metadata checks, covers those rows.
