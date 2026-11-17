-- Owner-run read-only lookup for the existing disposable verification target.
-- Returns account email addresses, never passwords, codes or session values.
-- Use only to select a known test Administrator; keep results out of logs.
IF DB_NAME() <> N'ct_password_auth_test'
    THROW 53300, 'Wrong verification database.', 1;

SELECT u.email AS AdministratorEmail
FROM   dbo.AuthUsers AS u
WHERE  u.disabled = 0
       AND u.emailVerified = 1
       AND u.activatedAt IS NOT NULL
       AND EXISTS (SELECT 1
                   FROM   dbo.AuthRoleAssignments AS r
                   WHERE  r.UserId = u.id
                          AND r.Role = 'Administrator')
       AND EXISTS (SELECT 1
                   FROM   dbo.AuthInvitations AS i
                   WHERE  i.UserId = u.id
                          AND i.AcceptedAt IS NOT NULL)
       AND EXISTS (SELECT 1
                   FROM   dbo.AuthAccounts AS a
                   WHERE  a.userId = u.id
                          AND a.providerId = N'credential'
                          AND a.password IS NOT NULL);
