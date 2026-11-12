-- Owner-run read-only; emits counts only, never identities or credential/session values.
DECLARE @n int, @s int, @i int;
SET @n = @@TRANCOUNT;
SET @s = XACT_STATE();
SET @i = CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
IF @n <> 0 OR @s <> 0 OR @i <> 0
    THROW 53310, 'Use a clean autocommit connection; existing work is not ended.', 1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'ct_password_auth_test'
    THROW 53300, 'Wrong disposable database.', 1;
;WITH state AS (
    SELECT CASE WHEN u.activatedAt IS NULL THEN 1 ELSE 0 END AS Pending,
    CASE WHEN u.disabled=1 THEN 1 ELSE 0 END AS Disabled,
    CASE WHEN u.activatedAt IS NOT NULL AND u.emailVerified=1 AND u.disabled=0
      AND EXISTS(SELECT 1 FROM dbo.AuthInvitations i WHERE i.UserId=u.id AND i.AcceptedAt IS NOT NULL)
      AND EXISTS(SELECT 1 FROM dbo.AuthAccounts a WHERE a.userId=u.id AND a.providerId=N'credential' AND a.password IS NOT NULL)
      AND EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments r WHERE r.UserId=u.id AND r.Role='Administrator')
      THEN 1 ELSE 0 END AS Ready
    FROM dbo.AuthUsers u
)
SELECT COUNT(*) AS TotalAccounts, COALESCE(SUM(Pending),0) AS PendingAccounts,
    COALESCE(SUM(Disabled),0) AS DisabledAccounts,
    COALESCE(SUM(Ready),0) AS ReadyAdministrators FROM state;
SET @n = @@TRANCOUNT;
SET @s = XACT_STATE();
SELECT @n AS FinalOpenTransactions, @s AS FinalTransactionState;
