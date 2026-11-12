-- OWNER REVIEW ONLY: no SQL is executed by the coding agent.
-- Replace the database/user; default is preflight only. Set @Apply=1 explicitly.
-- No principal creation, role repair, public-article grant changes or migrations.
SET NOCOUNT ON; SET XACT_ABORT ON;
DECLARE @RuntimePrincipal sysname=N'REPLACE_RUNTIME_USER', @Apply bit=0, @n int, @s int, @i int;
SET @n=@@TRANCOUNT; SET @s=XACT_STATE(); SET @i=CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
IF @n<>0 OR @s<>0 OR @i<>0 THROW 53230,'Use a clean owner autocommit connection.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'REPLACE_DATABASE' THROW 53230,'Select the reviewed database.',1;
IF ISNULL(HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CONTROL'),0)<>1 THROW 53230,'Owner visibility and authority required.',1;
DECLARE @id int=DATABASE_PRINCIPAL_ID(@RuntimePrincipal);
IF @RuntimePrincipal=N'REPLACE_RUNTIME_USER' OR @id IS NULL OR @id<=4
 OR NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE principal_id=@id AND type IN('S','E','U'))
 THROW 53230,'Select an existing individual runtime user, not an owner, role or group.',1;
DECLARE @Tokens TABLE(Id int PRIMARY KEY);
;WITH roles AS(SELECT @id AS Id UNION ALL SELECT r.role_principal_id FROM sys.database_role_members r JOIN roles ON roles.Id=r.member_principal_id)
INSERT @Tokens SELECT DISTINCT Id FROM roles UNION SELECT DATABASE_PRINCIPAL_ID(N'public') OPTION(MAXRECURSION 100);
IF EXISTS(SELECT 1 FROM @Tokens t JOIN sys.database_principals p ON p.principal_id=t.Id WHERE p.is_fixed_role=1 AND p.name<>N'public')
 OR EXISTS(SELECT 1 FROM @Tokens t JOIN sys.schemas s ON s.principal_id=t.Id)
 OR EXISTS(SELECT 1 FROM @Tokens t JOIN sys.objects o ON o.principal_id=t.Id WHERE o.is_ms_shipped=0)
 OR EXISTS(SELECT 1 FROM @Tokens t JOIN sys.database_principals p ON p.owning_principal_id=t.Id)
 OR EXISTS(SELECT 1 FROM sys.databases d JOIN sys.database_principals p ON p.sid=d.owner_sid WHERE d.database_id=DB_ID() AND p.principal_id=@id)
 THROW 53231,'Role membership or ownership requires separate owner review.',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN @Tokens t ON t.Id=p.grantee_principal_id WHERE p.state='W'
 OR (p.state IN('G','W') AND p.class=0 AND p.permission_name NOT IN(N'CONNECT',N'VIEW DEFINITION',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
 OR (p.state IN('G','W') AND p.class=4)
 OR (p.state IN('G','W') AND p.class=3 AND p.major_id NOT IN(SCHEMA_ID(N'sys'),SCHEMA_ID(N'INFORMATION_SCHEMA'))))
 THROW 53231,'Broad inherited/database/schema rights or grant options require separate review.',1;
DECLARE @Expected TABLE(ObjectName sysname, PermissionName nvarchar(60), ColumnName sysname NULL, Allowed bit);
INSERT @Expected VALUES
(N'AuthUsers',N'SELECT',NULL,1), (N'AuthUsers',N'INSERT',NULL,0), (N'AuthUsers',N'UPDATE',NULL,0),
(N'AuthUsers',N'DELETE',NULL,0), (N'AuthUsers',N'ALTER',NULL,0), (N'AuthUsers',N'CONTROL',NULL,0),
(N'AuthUsers',N'TAKE OWNERSHIP',NULL,0), (N'AuthUsers',N'REFERENCES',NULL,0), (N'AuthUsers',N'SELECT',N'id',1),
(N'AuthUsers',N'UPDATE',N'id',0), (N'AuthUsers',N'REFERENCES',N'id',0), (N'AuthUsers',N'SELECT',N'name',1),
(N'AuthUsers',N'UPDATE',N'name',0), (N'AuthUsers',N'REFERENCES',N'name',0), (N'AuthUsers',N'SELECT',N'email',1),
(N'AuthUsers',N'UPDATE',N'email',0), (N'AuthUsers',N'REFERENCES',N'email',0), (N'AuthUsers',N'SELECT',N'emailVerified',1),
(N'AuthUsers',N'UPDATE',N'emailVerified',1), (N'AuthUsers',N'REFERENCES',N'emailVerified',0), (N'AuthUsers',N'SELECT',N'image',1),
(N'AuthUsers',N'UPDATE',N'image',0), (N'AuthUsers',N'REFERENCES',N'image',0), (N'AuthUsers',N'SELECT',N'createdAt',1),
(N'AuthUsers',N'UPDATE',N'createdAt',0), (N'AuthUsers',N'REFERENCES',N'createdAt',0), (N'AuthUsers',N'SELECT',N'updatedAt',1),
(N'AuthUsers',N'UPDATE',N'updatedAt',1), (N'AuthUsers',N'REFERENCES',N'updatedAt',0), (N'AuthUsers',N'SELECT',N'disabled',1),
(N'AuthUsers',N'UPDATE',N'disabled',0), (N'AuthUsers',N'REFERENCES',N'disabled',0), (N'AuthUsers',N'SELECT',N'actorId',1),
(N'AuthUsers',N'UPDATE',N'actorId',0), (N'AuthUsers',N'REFERENCES',N'actorId',0), (N'AuthUsers',N'SELECT',N'activatedAt',1),
(N'AuthUsers',N'UPDATE',N'activatedAt',0), (N'AuthUsers',N'REFERENCES',N'activatedAt',0), (N'AuthAccounts',N'SELECT',NULL,1),
(N'AuthAccounts',N'INSERT',NULL,1), (N'AuthAccounts',N'UPDATE',NULL,0), (N'AuthAccounts',N'DELETE',NULL,0),
(N'AuthAccounts',N'ALTER',NULL,0), (N'AuthAccounts',N'CONTROL',NULL,0), (N'AuthAccounts',N'TAKE OWNERSHIP',NULL,0),
(N'AuthAccounts',N'REFERENCES',NULL,0), (N'AuthAccounts',N'SELECT',N'id',1), (N'AuthAccounts',N'UPDATE',N'id',0),
(N'AuthAccounts',N'REFERENCES',N'id',0), (N'AuthAccounts',N'SELECT',N'userId',1), (N'AuthAccounts',N'UPDATE',N'userId',0),
(N'AuthAccounts',N'REFERENCES',N'userId',0), (N'AuthAccounts',N'SELECT',N'accountId',1), (N'AuthAccounts',N'UPDATE',N'accountId',0),
(N'AuthAccounts',N'REFERENCES',N'accountId',0), (N'AuthAccounts',N'SELECT',N'providerId',1), (N'AuthAccounts',N'UPDATE',N'providerId',0),
(N'AuthAccounts',N'REFERENCES',N'providerId',0), (N'AuthAccounts',N'SELECT',N'accessToken',1), (N'AuthAccounts',N'UPDATE',N'accessToken',0),
(N'AuthAccounts',N'REFERENCES',N'accessToken',0), (N'AuthAccounts',N'SELECT',N'refreshToken',1), (N'AuthAccounts',N'UPDATE',N'refreshToken',0),
(N'AuthAccounts',N'REFERENCES',N'refreshToken',0), (N'AuthAccounts',N'SELECT',N'idToken',1), (N'AuthAccounts',N'UPDATE',N'idToken',0),
(N'AuthAccounts',N'REFERENCES',N'idToken',0), (N'AuthAccounts',N'SELECT',N'accessTokenExpiresAt',1), (N'AuthAccounts',N'UPDATE',N'accessTokenExpiresAt',0),
(N'AuthAccounts',N'REFERENCES',N'accessTokenExpiresAt',0), (N'AuthAccounts',N'SELECT',N'refreshTokenExpiresAt',1), (N'AuthAccounts',N'UPDATE',N'refreshTokenExpiresAt',0),
(N'AuthAccounts',N'REFERENCES',N'refreshTokenExpiresAt',0), (N'AuthAccounts',N'SELECT',N'scope',1), (N'AuthAccounts',N'UPDATE',N'scope',0),
(N'AuthAccounts',N'REFERENCES',N'scope',0), (N'AuthAccounts',N'SELECT',N'password',1), (N'AuthAccounts',N'UPDATE',N'password',1),
(N'AuthAccounts',N'REFERENCES',N'password',0), (N'AuthAccounts',N'SELECT',N'createdAt',1), (N'AuthAccounts',N'UPDATE',N'createdAt',0),
(N'AuthAccounts',N'REFERENCES',N'createdAt',0), (N'AuthAccounts',N'SELECT',N'updatedAt',1), (N'AuthAccounts',N'UPDATE',N'updatedAt',1),
(N'AuthAccounts',N'REFERENCES',N'updatedAt',0), (N'AuthSessions',N'SELECT',NULL,1), (N'AuthSessions',N'INSERT',NULL,1),
(N'AuthSessions',N'UPDATE',NULL,0), (N'AuthSessions',N'DELETE',NULL,1), (N'AuthSessions',N'ALTER',NULL,0),
(N'AuthSessions',N'CONTROL',NULL,0), (N'AuthSessions',N'TAKE OWNERSHIP',NULL,0), (N'AuthSessions',N'REFERENCES',NULL,0),
(N'AuthSessions',N'SELECT',N'id',1), (N'AuthSessions',N'UPDATE',N'id',0), (N'AuthSessions',N'REFERENCES',N'id',0),
(N'AuthSessions',N'SELECT',N'userId',1), (N'AuthSessions',N'UPDATE',N'userId',0), (N'AuthSessions',N'REFERENCES',N'userId',0),
(N'AuthSessions',N'SELECT',N'token',1), (N'AuthSessions',N'UPDATE',N'token',0), (N'AuthSessions',N'REFERENCES',N'token',0),
(N'AuthSessions',N'SELECT',N'expiresAt',1), (N'AuthSessions',N'UPDATE',N'expiresAt',0), (N'AuthSessions',N'REFERENCES',N'expiresAt',0),
(N'AuthSessions',N'SELECT',N'createdAt',1), (N'AuthSessions',N'UPDATE',N'createdAt',0), (N'AuthSessions',N'REFERENCES',N'createdAt',0),
(N'AuthSessions',N'SELECT',N'updatedAt',1), (N'AuthSessions',N'UPDATE',N'updatedAt',0), (N'AuthSessions',N'REFERENCES',N'updatedAt',0),
(N'AuthSessions',N'SELECT',N'ipAddress',1), (N'AuthSessions',N'UPDATE',N'ipAddress',0), (N'AuthSessions',N'REFERENCES',N'ipAddress',0),
(N'AuthSessions',N'SELECT',N'userAgent',1), (N'AuthSessions',N'UPDATE',N'userAgent',0), (N'AuthSessions',N'REFERENCES',N'userAgent',0),
(N'AuthVerifications',N'SELECT',NULL,1), (N'AuthVerifications',N'INSERT',NULL,1), (N'AuthVerifications',N'UPDATE',NULL,0),
(N'AuthVerifications',N'DELETE',NULL,1), (N'AuthVerifications',N'ALTER',NULL,0), (N'AuthVerifications',N'CONTROL',NULL,0),
(N'AuthVerifications',N'TAKE OWNERSHIP',NULL,0), (N'AuthVerifications',N'REFERENCES',NULL,0), (N'AuthVerifications',N'SELECT',N'id',1),
(N'AuthVerifications',N'UPDATE',N'id',0), (N'AuthVerifications',N'REFERENCES',N'id',0), (N'AuthVerifications',N'SELECT',N'identifier',1),
(N'AuthVerifications',N'UPDATE',N'identifier',0), (N'AuthVerifications',N'REFERENCES',N'identifier',0), (N'AuthVerifications',N'SELECT',N'value',1),
(N'AuthVerifications',N'UPDATE',N'value',0), (N'AuthVerifications',N'REFERENCES',N'value',0), (N'AuthVerifications',N'SELECT',N'expiresAt',1),
(N'AuthVerifications',N'UPDATE',N'expiresAt',0), (N'AuthVerifications',N'REFERENCES',N'expiresAt',0), (N'AuthVerifications',N'SELECT',N'createdAt',1),
(N'AuthVerifications',N'UPDATE',N'createdAt',0), (N'AuthVerifications',N'REFERENCES',N'createdAt',0), (N'AuthVerifications',N'SELECT',N'updatedAt',1),
(N'AuthVerifications',N'UPDATE',N'updatedAt',0), (N'AuthVerifications',N'REFERENCES',N'updatedAt',0), (N'AuthSetupVerifications',N'SELECT',NULL,1),
(N'AuthSetupVerifications',N'INSERT',NULL,1), (N'AuthSetupVerifications',N'UPDATE',NULL,0), (N'AuthSetupVerifications',N'DELETE',NULL,1),
(N'AuthSetupVerifications',N'ALTER',NULL,0), (N'AuthSetupVerifications',N'CONTROL',NULL,0), (N'AuthSetupVerifications',N'TAKE OWNERSHIP',NULL,0),
(N'AuthSetupVerifications',N'REFERENCES',NULL,0), (N'AuthSetupVerifications',N'SELECT',N'id',1), (N'AuthSetupVerifications',N'UPDATE',N'id',0),
(N'AuthSetupVerifications',N'REFERENCES',N'id',0), (N'AuthSetupVerifications',N'SELECT',N'identifier',1), (N'AuthSetupVerifications',N'UPDATE',N'identifier',0),
(N'AuthSetupVerifications',N'REFERENCES',N'identifier',0), (N'AuthSetupVerifications',N'SELECT',N'value',1), (N'AuthSetupVerifications',N'UPDATE',N'value',0),
(N'AuthSetupVerifications',N'REFERENCES',N'value',0), (N'AuthSetupVerifications',N'SELECT',N'expiresAt',1), (N'AuthSetupVerifications',N'UPDATE',N'expiresAt',0),
(N'AuthSetupVerifications',N'REFERENCES',N'expiresAt',0), (N'AuthSetupVerifications',N'SELECT',N'createdAt',1), (N'AuthSetupVerifications',N'UPDATE',N'createdAt',0),
(N'AuthSetupVerifications',N'REFERENCES',N'createdAt',0), (N'AuthSetupVerifications',N'SELECT',N'updatedAt',1), (N'AuthSetupVerifications',N'UPDATE',N'updatedAt',0),
(N'AuthSetupVerifications',N'REFERENCES',N'updatedAt',0), (N'AuthRoleAssignments',N'SELECT',NULL,1), (N'AuthRoleAssignments',N'INSERT',NULL,0),
(N'AuthRoleAssignments',N'UPDATE',NULL,0), (N'AuthRoleAssignments',N'DELETE',NULL,0), (N'AuthRoleAssignments',N'ALTER',NULL,0),
(N'AuthRoleAssignments',N'CONTROL',NULL,0), (N'AuthRoleAssignments',N'TAKE OWNERSHIP',NULL,0), (N'AuthRoleAssignments',N'REFERENCES',NULL,0),
(N'AuthRoleAssignments',N'SELECT',N'UserId',1), (N'AuthRoleAssignments',N'UPDATE',N'UserId',0), (N'AuthRoleAssignments',N'REFERENCES',N'UserId',0),
(N'AuthRoleAssignments',N'SELECT',N'Role',1), (N'AuthRoleAssignments',N'UPDATE',N'Role',0), (N'AuthRoleAssignments',N'REFERENCES',N'Role',0),
(N'AuthRoleAssignments',N'SELECT',N'CreatedAt',1), (N'AuthRoleAssignments',N'UPDATE',N'CreatedAt',0), (N'AuthRoleAssignments',N'REFERENCES',N'CreatedAt',0),
(N'AuthInvitations',N'SELECT',NULL,1), (N'AuthInvitations',N'INSERT',NULL,0), (N'AuthInvitations',N'UPDATE',NULL,0),
(N'AuthInvitations',N'DELETE',NULL,0), (N'AuthInvitations',N'ALTER',NULL,0), (N'AuthInvitations',N'CONTROL',NULL,0),
(N'AuthInvitations',N'TAKE OWNERSHIP',NULL,0), (N'AuthInvitations',N'REFERENCES',NULL,0), (N'AuthInvitations',N'SELECT',N'Id',1),
(N'AuthInvitations',N'UPDATE',N'Id',0), (N'AuthInvitations',N'REFERENCES',N'Id',0), (N'AuthInvitations',N'SELECT',N'UserId',1),
(N'AuthInvitations',N'UPDATE',N'UserId',0), (N'AuthInvitations',N'REFERENCES',N'UserId',0), (N'AuthInvitations',N'SELECT',N'InvitedBy',1),
(N'AuthInvitations',N'UPDATE',N'InvitedBy',0), (N'AuthInvitations',N'REFERENCES',N'InvitedBy',0), (N'AuthInvitations',N'SELECT',N'CreatedAt',1),
(N'AuthInvitations',N'UPDATE',N'CreatedAt',0), (N'AuthInvitations',N'REFERENCES',N'CreatedAt',0), (N'AuthInvitations',N'SELECT',N'ExpiresAt',1),
(N'AuthInvitations',N'UPDATE',N'ExpiresAt',0), (N'AuthInvitations',N'REFERENCES',N'ExpiresAt',0), (N'AuthInvitations',N'SELECT',N'AcceptedAt',1),
(N'AuthInvitations',N'UPDATE',N'AcceptedAt',0), (N'AuthInvitations',N'REFERENCES',N'AcceptedAt',0), (N'AuthNotifications',N'SELECT',NULL,1),
(N'AuthNotifications',N'INSERT',NULL,0), (N'AuthNotifications',N'UPDATE',NULL,0), (N'AuthNotifications',N'DELETE',NULL,0),
(N'AuthNotifications',N'ALTER',NULL,0), (N'AuthNotifications',N'CONTROL',NULL,0), (N'AuthNotifications',N'TAKE OWNERSHIP',NULL,0),
(N'AuthNotifications',N'REFERENCES',NULL,0), (N'AuthNotifications',N'SELECT',N'UserId',1), (N'AuthNotifications',N'UPDATE',N'UserId',0),
(N'AuthNotifications',N'REFERENCES',N'UserId',0), (N'AuthNotifications',N'SELECT',N'CreatedAt',1), (N'AuthNotifications',N'UPDATE',N'CreatedAt',0),
(N'AuthNotifications',N'REFERENCES',N'CreatedAt',0), (N'AuthNotifications',N'SELECT',N'DeliveredAt',1), (N'AuthNotifications',N'UPDATE',N'DeliveredAt',1),
(N'AuthNotifications',N'REFERENCES',N'DeliveredAt',0), (N'ActivityEvents',N'SELECT',NULL,0), (N'ActivityEvents',N'INSERT',NULL,0),
(N'ActivityEvents',N'UPDATE',NULL,0), (N'ActivityEvents',N'DELETE',NULL,0), (N'ActivityEvents',N'ALTER',NULL,0),
(N'ActivityEvents',N'CONTROL',NULL,0), (N'ActivityEvents',N'TAKE OWNERSHIP',NULL,0), (N'ActivityEvents',N'REFERENCES',NULL,0),
(N'ActivityEvents',N'SELECT',N'Id',0), (N'ActivityEvents',N'UPDATE',N'Id',0), (N'ActivityEvents',N'REFERENCES',N'Id',0),
(N'ActivityEvents',N'SELECT',N'OccurredAt',0), (N'ActivityEvents',N'UPDATE',N'OccurredAt',0), (N'ActivityEvents',N'REFERENCES',N'OccurredAt',0),
(N'ActivityEvents',N'SELECT',N'EventType',0), (N'ActivityEvents',N'UPDATE',N'EventType',0), (N'ActivityEvents',N'REFERENCES',N'EventType',0),
(N'ActivityEvents',N'SELECT',N'Outcome',0), (N'ActivityEvents',N'UPDATE',N'Outcome',0), (N'ActivityEvents',N'REFERENCES',N'Outcome',0),
(N'ActivityEvents',N'SELECT',N'ActorKind',0), (N'ActivityEvents',N'UPDATE',N'ActorKind',0), (N'ActivityEvents',N'REFERENCES',N'ActorKind',0),
(N'ActivityEvents',N'SELECT',N'ActingAccountId',0), (N'ActivityEvents',N'UPDATE',N'ActingAccountId',0), (N'ActivityEvents',N'REFERENCES',N'ActingAccountId',0),
(N'ActivityEvents',N'SELECT',N'TargetAccountId',0), (N'ActivityEvents',N'UPDATE',N'TargetAccountId',0), (N'ActivityEvents',N'REFERENCES',N'TargetAccountId',0),
(N'ActivityEvents',N'SELECT',N'ArticleId',0), (N'ActivityEvents',N'UPDATE',N'ArticleId',0), (N'ActivityEvents',N'REFERENCES',N'ArticleId',0),
(N'ActivityEvents',N'SELECT',N'RevisionId',0), (N'ActivityEvents',N'UPDATE',N'RevisionId',0), (N'ActivityEvents',N'REFERENCES',N'RevisionId',0),
(N'ActivityEvents',N'SELECT',N'Role',0), (N'ActivityEvents',N'UPDATE',N'Role',0), (N'ActivityEvents',N'REFERENCES',N'Role',0),
(N'ActivityEvents',N'SELECT',N'Reason',0), (N'ActivityEvents',N'UPDATE',N'Reason',0), (N'ActivityEvents',N'REFERENCES',N'Reason',0),
(N'ActivityEvents',N'SELECT',N'CorrelationId',0), (N'ActivityEvents',N'UPDATE',N'CorrelationId',0), (N'ActivityEvents',N'REFERENCES',N'CorrelationId',0),
(N'AuthAuditEvents',N'SELECT',NULL,0), (N'AuthAuditEvents',N'INSERT',NULL,0), (N'AuthAuditEvents',N'UPDATE',NULL,0),
(N'AuthAuditEvents',N'DELETE',NULL,0), (N'AuthAuditEvents',N'ALTER',NULL,0), (N'AuthAuditEvents',N'CONTROL',NULL,0),
(N'AuthAuditEvents',N'TAKE OWNERSHIP',NULL,0), (N'AuthAuditEvents',N'REFERENCES',NULL,0), (N'AuthAuditEvents',N'SELECT',N'Id',0),
(N'AuthAuditEvents',N'UPDATE',N'Id',0), (N'AuthAuditEvents',N'REFERENCES',N'Id',0), (N'AuthAuditEvents',N'SELECT',N'ActingUserId',0),
(N'AuthAuditEvents',N'UPDATE',N'ActingUserId',0), (N'AuthAuditEvents',N'REFERENCES',N'ActingUserId',0), (N'AuthAuditEvents',N'SELECT',N'TargetUserId',0),
(N'AuthAuditEvents',N'UPDATE',N'TargetUserId',0), (N'AuthAuditEvents',N'REFERENCES',N'TargetUserId',0), (N'AuthAuditEvents',N'SELECT',N'Action',0),
(N'AuthAuditEvents',N'UPDATE',N'Action',0), (N'AuthAuditEvents',N'REFERENCES',N'Action',0), (N'AuthAuditEvents',N'SELECT',N'Role',0),
(N'AuthAuditEvents',N'UPDATE',N'Role',0), (N'AuthAuditEvents',N'REFERENCES',N'Role',0), (N'AuthAuditEvents',N'SELECT',N'CreatedAt',0),
(N'AuthAuditEvents',N'UPDATE',N'CreatedAt',0), (N'AuthAuditEvents',N'REFERENCES',N'CreatedAt',0), (N'AuthSecurityBuckets',N'SELECT',NULL,0),
(N'AuthSecurityBuckets',N'INSERT',NULL,0), (N'AuthSecurityBuckets',N'UPDATE',NULL,0), (N'AuthSecurityBuckets',N'DELETE',NULL,0),
(N'AuthSecurityBuckets',N'ALTER',NULL,0), (N'AuthSecurityBuckets',N'CONTROL',NULL,0), (N'AuthSecurityBuckets',N'TAKE OWNERSHIP',NULL,0),
(N'AuthSecurityBuckets',N'REFERENCES',NULL,0), (N'AuthSecurityBuckets',N'SELECT',N'Slot',0), (N'AuthSecurityBuckets',N'UPDATE',N'Slot',0),
(N'AuthSecurityBuckets',N'REFERENCES',N'Slot',0), (N'AuthSecurityBuckets',N'SELECT',N'EventType',0), (N'AuthSecurityBuckets',N'UPDATE',N'EventType',0),
(N'AuthSecurityBuckets',N'REFERENCES',N'EventType',0), (N'AuthSecurityBuckets',N'SELECT',N'Id',0), (N'AuthSecurityBuckets',N'UPDATE',N'Id',0),
(N'AuthSecurityBuckets',N'REFERENCES',N'Id',0), (N'AuthSecurityBuckets',N'SELECT',N'PeriodStart',0), (N'AuthSecurityBuckets',N'UPDATE',N'PeriodStart',0),
(N'AuthSecurityBuckets',N'REFERENCES',N'PeriodStart',0), (N'AuthSecurityBuckets',N'SELECT',N'Attempts',0), (N'AuthSecurityBuckets',N'UPDATE',N'Attempts',0),
(N'AuthSecurityBuckets',N'REFERENCES',N'Attempts',0), (N'AuthThrottleBuckets',N'SELECT',NULL,0), (N'AuthThrottleBuckets',N'INSERT',NULL,0),
(N'AuthThrottleBuckets',N'UPDATE',NULL,0), (N'AuthThrottleBuckets',N'DELETE',NULL,0), (N'AuthThrottleBuckets',N'ALTER',NULL,0),
(N'AuthThrottleBuckets',N'CONTROL',NULL,0), (N'AuthThrottleBuckets',N'TAKE OWNERSHIP',NULL,0), (N'AuthThrottleBuckets',N'REFERENCES',NULL,0),
(N'AuthThrottleBuckets',N'SELECT',N'Bucket',0), (N'AuthThrottleBuckets',N'UPDATE',N'Bucket',0), (N'AuthThrottleBuckets',N'REFERENCES',N'Bucket',0),
(N'AuthThrottleBuckets',N'SELECT',N'WindowStart',0), (N'AuthThrottleBuckets',N'UPDATE',N'WindowStart',0), (N'AuthThrottleBuckets',N'REFERENCES',N'WindowStart',0),
(N'AuthThrottleBuckets',N'SELECT',N'Attempts',0), (N'AuthThrottleBuckets',N'UPDATE',N'Attempts',0), (N'AuthThrottleBuckets',N'REFERENCES',N'Attempts',0),
(N'AuthManageAccount',N'EXECUTE',NULL,1), (N'AuthManageAccount',N'ALTER',NULL,0), (N'AuthManageAccount',N'CONTROL',NULL,0),
(N'AuthManageAccount',N'TAKE OWNERSHIP',NULL,0), (N'AuthThrottle',N'EXECUTE',NULL,1), (N'AuthThrottle',N'ALTER',NULL,0),
(N'AuthThrottle',N'CONTROL',NULL,0), (N'AuthThrottle',N'TAKE OWNERSHIP',NULL,0), (N'AuthBeginSession',N'EXECUTE',NULL,1),
(N'AuthBeginSession',N'ALTER',NULL,0), (N'AuthBeginSession',N'CONTROL',NULL,0), (N'AuthBeginSession',N'TAKE OWNERSHIP',NULL,0),
(N'AuthRecordSessionEvent',N'EXECUTE',NULL,1), (N'AuthRecordSessionEvent',N'ALTER',NULL,0), (N'AuthRecordSessionEvent',N'CONTROL',NULL,0),
(N'AuthRecordSessionEvent',N'TAKE OWNERSHIP',NULL,0), (N'AuthCompletePassword',N'EXECUTE',NULL,1), (N'AuthCompletePassword',N'ALTER',NULL,0),
(N'AuthCompletePassword',N'CONTROL',NULL,0), (N'AuthCompletePassword',N'TAKE OWNERSHIP',NULL,0), (N'AuthSecurityEvent',N'EXECUTE',NULL,1),
(N'AuthSecurityEvent',N'ALTER',NULL,0), (N'AuthSecurityEvent',N'CONTROL',NULL,0), (N'AuthSecurityEvent',N'TAKE OWNERSHIP',NULL,0),
(N'AuthListActivity',N'EXECUTE',NULL,1), (N'AuthListActivity',N'ALTER',NULL,0), (N'AuthListActivity',N'CONTROL',NULL,0),
(N'AuthListActivity',N'TAKE OWNERSHIP',NULL,0), (N'AuthBootstrapAdministrator',N'EXECUTE',NULL,0), (N'AuthBootstrapAdministrator',N'ALTER',NULL,0),
(N'AuthBootstrapAdministrator',N'CONTROL',NULL,0), (N'AuthBootstrapAdministrator',N'TAKE OWNERSHIP',NULL,0), (N'AuthRecoverPending',N'EXECUTE',NULL,0),
(N'AuthRecoverPending',N'ALTER',NULL,0), (N'AuthRecoverPending',N'CONTROL',NULL,0), (N'AuthRecoverPending',N'TAKE OWNERSHIP',NULL,0);

IF EXISTS(SELECT 1 FROM @Expected WHERE OBJECT_ID(N'dbo.'+ObjectName) IS NULL OR (ColumnName IS NOT NULL AND COL_LENGTH(N'dbo.'+ObjectName,ColumnName) IS NULL))
 THROW 53230,'Required schema is missing; do not apply permissions.',1;
-- Refuse excessive inherited auth grants; never edit other users/roles to mask them.
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN @Tokens t ON t.Id=p.grantee_principal_id
 JOIN sys.objects o ON o.object_id=p.major_id JOIN sys.schemas s ON s.schema_id=o.schema_id
 LEFT JOIN sys.columns c ON c.object_id=p.major_id AND c.column_id=p.minor_id
 WHERE p.class=1 AND p.state IN('G','W') AND t.Id<>@id AND s.name=N'dbo'
 AND EXISTS(SELECT 1 FROM @Expected e WHERE e.ObjectName COLLATE Latin1_General_100_BIN2=o.name COLLATE Latin1_General_100_BIN2)
 AND NOT EXISTS(SELECT 1 FROM @Expected e WHERE e.ObjectName COLLATE Latin1_General_100_BIN2=o.name COLLATE Latin1_General_100_BIN2 AND e.PermissionName COLLATE Latin1_General_100_BIN2=p.permission_name COLLATE Latin1_General_100_BIN2
 AND ISNULL(e.ColumnName,N'') COLLATE Latin1_General_100_BIN2=ISNULL(c.name,N'') COLLATE Latin1_General_100_BIN2 AND e.Allowed=1))
 THROW 53231,'Excessive inherited object/column rights require separate review.',1;
IF EXISTS(SELECT 1 FROM sys.database_permissions p JOIN @Tokens t ON t.Id=p.grantee_principal_id
 JOIN sys.objects o ON o.object_id=p.major_id JOIN sys.schemas s ON s.schema_id=o.schema_id
 WHERE p.class=1 AND p.state IN('G','W') AND o.is_ms_shipped=0
 AND p.permission_name IN(N'SELECT',N'INSERT',N'UPDATE',N'DELETE',N'EXECUTE',N'CONTROL',N'ALTER',N'TAKE OWNERSHIP',N'REFERENCES')
 AND NOT EXISTS(SELECT 1 FROM @Expected e WHERE s.name=N'dbo' AND e.ObjectName COLLATE Latin1_General_100_BIN2=o.name COLLATE Latin1_General_100_BIN2)
 AND NOT(s.name=N'dbo' AND o.name=N'PublicArticles' AND p.permission_name=N'SELECT'))
 THROW 53231,'Unexpected user-object grants require separate owner review.',1;
DECLARE @principal nvarchar(258)=QUOTENAME(@RuntimePrincipal), @userLiteral nvarchar(260)=N'N'''+REPLACE(@RuntimePrincipal,N'''',N'''''')+N'''', @publicBefore int;
DECLARE @Preflight nvarchar(max)=N'DECLARE @switched bit=0; BEGIN TRY EXECUTE AS USER = '+@userLiteral+N'; SET @switched=1;
-- Effective checks run as the selected user (or the actual connected identity).
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.principal_id=t.principal_id WHERE p.is_fixed_role=1 AND p.name<>N''public'')
 THROW 53231,''Fixed runtime roles rejected.'',1;
IF USER_ID()=1 OR IS_MEMBER(N''db_owner'')=1 OR IS_MEMBER(N''db_ddladmin'')=1 OR IS_MEMBER(N''db_securityadmin'')=1
 THROW 53231,''Privileged runtime context rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N''DATABASE'') WHERE permission_name NOT IN
 (N''CONNECT'',N''VIEW DEFINITION'',N''VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'',N''VIEW ANY COLUMN MASTER KEY DEFINITION''))
 THROW 53231,''Broad database permissions rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.schemas s CROSS APPLY sys.fn_my_permissions(s.name,N''SCHEMA'') p
 WHERE s.name NOT IN(N''sys'',N''INFORMATION_SCHEMA'') AND p.permission_name IN
 (N''CONTROL'',N''ALTER'',N''TAKE OWNERSHIP'',N''SELECT'',N''INSERT'',N''UPDATE'',N''DELETE'',N''EXECUTE'',N''REFERENCES''))
 THROW 53231,''Broad schema permissions rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.schemas s ON s.principal_id=t.principal_id)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.objects o ON o.principal_id=t.principal_id WHERE o.is_ms_shipped=0)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.owning_principal_id=t.principal_id)
 THROW 53231,''Runtime token owns a schema, object or principal.'',1;
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY(VALUES(N''CONTROL''),(N''ALTER''),(N''TAKE OWNERSHIP''),(N''REFERENCES'')) p(PermissionName)
 WHERE o.is_ms_shipped=0 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N''.''+QUOTENAME(o.name),N''OBJECT'',p.PermissionName)=1)
 OR EXISTS(SELECT 1 FROM sys.database_principals p WHERE p.principal_id<>USER_ID()
 AND HAS_PERMS_BY_NAME(p.name,N''USER'',N''IMPERSONATE'')=1)
 OR EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.user_token t ON t.principal_id=p.grantee_principal_id WHERE p.state=''W'' OR (p.class=4 AND p.state IN(''G'',''W'')))
 THROW 53231,''Object authority, impersonation or grant options rejected.'',1;
IF ISNULL(CONVERT(int,SERVERPROPERTY(''EngineEdition'')),0)<>5
BEGIN
IF
 (ISNULL(IS_SRVROLEMEMBER(N''sysadmin''),1)<>0 OR ISNULL(HAS_PERMS_BY_NAME(NULL,N''SERVER'',N''CONTROL SERVER''),1)<>0
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N''SERVER'') WHERE permission_name NOT IN(N''CONNECT SQL'',N''VIEW ANY DATABASE'')))
 THROW 53231,''Server-level authority is unsafe or unobservable.'',1;
END;

SET @public=ISNULL(HAS_PERMS_BY_NAME(N''dbo.PublicArticles'',N''OBJECT'',N''SELECT''),0); REVERT; SET @switched=0; END TRY BEGIN CATCH IF @switched=1 REVERT; THROW; END CATCH;';
EXEC sys.sp_executesql @Preflight,N'@public int OUTPUT',@public=@publicBefore OUTPUT;
IF @Apply=0 BEGIN SELECT CAST(1 AS bit) AS OwnerPreflightPassed,@publicBefore AS ExistingPublicArticleSelect; RETURN; END;
BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @Grant nvarchar(max)=CAST(N'' AS nvarchar(max))+N'REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthUsers FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthUsers TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthUsers TO '+@principal+N';
GRANT UPDATE ON OBJECT::dbo.AuthUsers (emailVerified,updatedAt) TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthUsers (id,name,email,image,createdAt,disabled,actorId,activatedAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthUsers TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthAccounts FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthAccounts TO '+@principal+N';
GRANT INSERT ON OBJECT::dbo.AuthAccounts TO '+@principal+N';
GRANT UPDATE ON OBJECT::dbo.AuthAccounts (password,updatedAt) TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthAccounts (id,userId,accountId,providerId,accessToken,refreshToken,idToken,accessTokenExpiresAt,refreshTokenExpiresAt,scope,createdAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthAccounts TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthSessions FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthSessions TO '+@principal+N';
GRANT INSERT ON OBJECT::dbo.AuthSessions TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSessions TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSessions (id,userId,token,expiresAt,createdAt,updatedAt,ipAddress,userAgent) TO '+@principal+N';
GRANT DELETE ON OBJECT::dbo.AuthSessions TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthVerifications FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthVerifications TO '+@principal+N';
GRANT INSERT ON OBJECT::dbo.AuthVerifications TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthVerifications TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthVerifications (id,identifier,value,expiresAt,createdAt,updatedAt) TO '+@principal+N';
GRANT DELETE ON OBJECT::dbo.AuthVerifications TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthSetupVerifications FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthSetupVerifications TO '+@principal+N';
GRANT INSERT ON OBJECT::dbo.AuthSetupVerifications TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSetupVerifications TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSetupVerifications (id,identifier,value,expiresAt,createdAt,updatedAt) TO '+@principal+N';
GRANT DELETE ON OBJECT::dbo.AuthSetupVerifications TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthRoleAssignments FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthRoleAssignments TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthRoleAssignments TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthRoleAssignments TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthRoleAssignments (UserId,Role,CreatedAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthRoleAssignments TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthInvitations FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthInvitations TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthInvitations TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthInvitations TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthInvitations (Id,UserId,InvitedBy,CreatedAt,ExpiresAt,AcceptedAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthInvitations TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthNotifications FROM '+@principal+N';
GRANT SELECT ON OBJECT::dbo.AuthNotifications TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthNotifications TO '+@principal+N';
GRANT UPDATE ON OBJECT::dbo.AuthNotifications (DeliveredAt) TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthNotifications (UserId,CreatedAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthNotifications TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.ActivityEvents FROM '+@principal+N';
DENY SELECT ON OBJECT::dbo.ActivityEvents TO '+@principal+N';
DENY SELECT ON OBJECT::dbo.ActivityEvents (Id,OccurredAt,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,ArticleId,RevisionId,Role,Reason,CorrelationId) TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.ActivityEvents TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.ActivityEvents TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.ActivityEvents (Id,OccurredAt,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,ArticleId,RevisionId,Role,Reason,CorrelationId) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.ActivityEvents TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthAuditEvents FROM '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthAuditEvents TO '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthAuditEvents (Id,ActingUserId,TargetUserId,Action,Role,CreatedAt) TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthAuditEvents TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthAuditEvents TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthAuditEvents (Id,ActingUserId,TargetUserId,Action,Role,CreatedAt) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthAuditEvents TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthSecurityBuckets FROM '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthSecurityBuckets TO '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthSecurityBuckets (Slot,EventType,Id,PeriodStart,Attempts) TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthSecurityBuckets TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSecurityBuckets TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthSecurityBuckets (Slot,EventType,Id,PeriodStart,Attempts) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthSecurityBuckets TO '+@principal+N';
REVOKE SELECT,INSERT,UPDATE,DELETE ON OBJECT::dbo.AuthThrottleBuckets FROM '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthThrottleBuckets TO '+@principal+N';
DENY SELECT ON OBJECT::dbo.AuthThrottleBuckets (Bucket,WindowStart,Attempts) TO '+@principal+N';
DENY INSERT ON OBJECT::dbo.AuthThrottleBuckets TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthThrottleBuckets TO '+@principal+N';
DENY UPDATE ON OBJECT::dbo.AuthThrottleBuckets (Bucket,WindowStart,Attempts) TO '+@principal+N';
DENY DELETE ON OBJECT::dbo.AuthThrottleBuckets TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthManageAccount TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthThrottle TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthBeginSession TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthRecordSessionEvent TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthCompletePassword TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthSecurityEvent TO '+@principal+N';
GRANT EXECUTE ON OBJECT::dbo.AuthListActivity TO '+@principal+N';
DENY EXECUTE ON OBJECT::dbo.AuthBootstrapAdministrator TO '+@principal+N';
DENY EXECUTE ON OBJECT::dbo.AuthRecoverPending TO '+@principal+N';
';
 EXEC sys.sp_executesql @Grant;
 DECLARE @Postcheck nvarchar(max)=N'DECLARE @switched bit=0; BEGIN TRY EXECUTE AS USER = '+@userLiteral+N'; SET @switched=1;
-- Effective checks run as the selected user (or the actual connected identity).
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.principal_id=t.principal_id WHERE p.is_fixed_role=1 AND p.name<>N''public'')
 THROW 53231,''Fixed runtime roles rejected.'',1;
IF USER_ID()=1 OR IS_MEMBER(N''db_owner'')=1 OR IS_MEMBER(N''db_ddladmin'')=1 OR IS_MEMBER(N''db_securityadmin'')=1
 THROW 53231,''Privileged runtime context rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N''DATABASE'') WHERE permission_name NOT IN
 (N''CONNECT'',N''VIEW DEFINITION'',N''VIEW ANY COLUMN ENCRYPTION KEY DEFINITION'',N''VIEW ANY COLUMN MASTER KEY DEFINITION''))
 THROW 53231,''Broad database permissions rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.schemas s CROSS APPLY sys.fn_my_permissions(s.name,N''SCHEMA'') p
 WHERE s.name NOT IN(N''sys'',N''INFORMATION_SCHEMA'') AND p.permission_name IN
 (N''CONTROL'',N''ALTER'',N''TAKE OWNERSHIP'',N''SELECT'',N''INSERT'',N''UPDATE'',N''DELETE'',N''EXECUTE'',N''REFERENCES''))
 THROW 53231,''Broad schema permissions rejected.'',1;
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.schemas s ON s.principal_id=t.principal_id)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.objects o ON o.principal_id=t.principal_id WHERE o.is_ms_shipped=0)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.owning_principal_id=t.principal_id)
 THROW 53231,''Runtime token owns a schema, object or principal.'',1;
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY(VALUES(N''CONTROL''),(N''ALTER''),(N''TAKE OWNERSHIP''),(N''REFERENCES'')) p(PermissionName)
 WHERE o.is_ms_shipped=0 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N''.''+QUOTENAME(o.name),N''OBJECT'',p.PermissionName)=1)
 OR EXISTS(SELECT 1 FROM sys.database_principals p WHERE p.principal_id<>USER_ID()
 AND HAS_PERMS_BY_NAME(p.name,N''USER'',N''IMPERSONATE'')=1)
 OR EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.user_token t ON t.principal_id=p.grantee_principal_id WHERE p.state=''W'' OR (p.class=4 AND p.state IN(''G'',''W'')))
 THROW 53231,''Object authority, impersonation or grant options rejected.'',1;
IF ISNULL(CONVERT(int,SERVERPROPERTY(''EngineEdition'')),0)<>5
BEGIN
IF
 (ISNULL(IS_SRVROLEMEMBER(N''sysadmin''),1)<>0 OR ISNULL(HAS_PERMS_BY_NAME(NULL,N''SERVER'',N''CONTROL SERVER''),1)<>0
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N''SERVER'') WHERE permission_name NOT IN(N''CONNECT SQL'',N''VIEW ANY DATABASE'')))
 THROW 53231,''Server-level authority is unsafe or unobservable.'',1;
END;
DECLARE @Expected TABLE(ObjectName sysname, PermissionName nvarchar(60), ColumnName sysname NULL, Allowed bit);
INSERT @Expected VALUES
(N''AuthUsers'',N''SELECT'',NULL,1), (N''AuthUsers'',N''INSERT'',NULL,0), (N''AuthUsers'',N''UPDATE'',NULL,0),
(N''AuthUsers'',N''DELETE'',NULL,0), (N''AuthUsers'',N''ALTER'',NULL,0), (N''AuthUsers'',N''CONTROL'',NULL,0),
(N''AuthUsers'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthUsers'',N''REFERENCES'',NULL,0), (N''AuthUsers'',N''SELECT'',N''id'',1),
(N''AuthUsers'',N''UPDATE'',N''id'',0), (N''AuthUsers'',N''REFERENCES'',N''id'',0), (N''AuthUsers'',N''SELECT'',N''name'',1),
(N''AuthUsers'',N''UPDATE'',N''name'',0), (N''AuthUsers'',N''REFERENCES'',N''name'',0), (N''AuthUsers'',N''SELECT'',N''email'',1),
(N''AuthUsers'',N''UPDATE'',N''email'',0), (N''AuthUsers'',N''REFERENCES'',N''email'',0), (N''AuthUsers'',N''SELECT'',N''emailVerified'',1),
(N''AuthUsers'',N''UPDATE'',N''emailVerified'',1), (N''AuthUsers'',N''REFERENCES'',N''emailVerified'',0), (N''AuthUsers'',N''SELECT'',N''image'',1),
(N''AuthUsers'',N''UPDATE'',N''image'',0), (N''AuthUsers'',N''REFERENCES'',N''image'',0), (N''AuthUsers'',N''SELECT'',N''createdAt'',1),
(N''AuthUsers'',N''UPDATE'',N''createdAt'',0), (N''AuthUsers'',N''REFERENCES'',N''createdAt'',0), (N''AuthUsers'',N''SELECT'',N''updatedAt'',1),
(N''AuthUsers'',N''UPDATE'',N''updatedAt'',1), (N''AuthUsers'',N''REFERENCES'',N''updatedAt'',0), (N''AuthUsers'',N''SELECT'',N''disabled'',1),
(N''AuthUsers'',N''UPDATE'',N''disabled'',0), (N''AuthUsers'',N''REFERENCES'',N''disabled'',0), (N''AuthUsers'',N''SELECT'',N''actorId'',1),
(N''AuthUsers'',N''UPDATE'',N''actorId'',0), (N''AuthUsers'',N''REFERENCES'',N''actorId'',0), (N''AuthUsers'',N''SELECT'',N''activatedAt'',1),
(N''AuthUsers'',N''UPDATE'',N''activatedAt'',0), (N''AuthUsers'',N''REFERENCES'',N''activatedAt'',0), (N''AuthAccounts'',N''SELECT'',NULL,1),
(N''AuthAccounts'',N''INSERT'',NULL,1), (N''AuthAccounts'',N''UPDATE'',NULL,0), (N''AuthAccounts'',N''DELETE'',NULL,0),
(N''AuthAccounts'',N''ALTER'',NULL,0), (N''AuthAccounts'',N''CONTROL'',NULL,0), (N''AuthAccounts'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthAccounts'',N''REFERENCES'',NULL,0), (N''AuthAccounts'',N''SELECT'',N''id'',1), (N''AuthAccounts'',N''UPDATE'',N''id'',0),
(N''AuthAccounts'',N''REFERENCES'',N''id'',0), (N''AuthAccounts'',N''SELECT'',N''userId'',1), (N''AuthAccounts'',N''UPDATE'',N''userId'',0),
(N''AuthAccounts'',N''REFERENCES'',N''userId'',0), (N''AuthAccounts'',N''SELECT'',N''accountId'',1), (N''AuthAccounts'',N''UPDATE'',N''accountId'',0),
(N''AuthAccounts'',N''REFERENCES'',N''accountId'',0), (N''AuthAccounts'',N''SELECT'',N''providerId'',1), (N''AuthAccounts'',N''UPDATE'',N''providerId'',0),
(N''AuthAccounts'',N''REFERENCES'',N''providerId'',0), (N''AuthAccounts'',N''SELECT'',N''accessToken'',1), (N''AuthAccounts'',N''UPDATE'',N''accessToken'',0),
(N''AuthAccounts'',N''REFERENCES'',N''accessToken'',0), (N''AuthAccounts'',N''SELECT'',N''refreshToken'',1), (N''AuthAccounts'',N''UPDATE'',N''refreshToken'',0),
(N''AuthAccounts'',N''REFERENCES'',N''refreshToken'',0), (N''AuthAccounts'',N''SELECT'',N''idToken'',1), (N''AuthAccounts'',N''UPDATE'',N''idToken'',0),
(N''AuthAccounts'',N''REFERENCES'',N''idToken'',0), (N''AuthAccounts'',N''SELECT'',N''accessTokenExpiresAt'',1), (N''AuthAccounts'',N''UPDATE'',N''accessTokenExpiresAt'',0),
(N''AuthAccounts'',N''REFERENCES'',N''accessTokenExpiresAt'',0), (N''AuthAccounts'',N''SELECT'',N''refreshTokenExpiresAt'',1), (N''AuthAccounts'',N''UPDATE'',N''refreshTokenExpiresAt'',0),
(N''AuthAccounts'',N''REFERENCES'',N''refreshTokenExpiresAt'',0), (N''AuthAccounts'',N''SELECT'',N''scope'',1), (N''AuthAccounts'',N''UPDATE'',N''scope'',0),
(N''AuthAccounts'',N''REFERENCES'',N''scope'',0), (N''AuthAccounts'',N''SELECT'',N''password'',1), (N''AuthAccounts'',N''UPDATE'',N''password'',1),
(N''AuthAccounts'',N''REFERENCES'',N''password'',0), (N''AuthAccounts'',N''SELECT'',N''createdAt'',1), (N''AuthAccounts'',N''UPDATE'',N''createdAt'',0),
(N''AuthAccounts'',N''REFERENCES'',N''createdAt'',0), (N''AuthAccounts'',N''SELECT'',N''updatedAt'',1), (N''AuthAccounts'',N''UPDATE'',N''updatedAt'',1),
(N''AuthAccounts'',N''REFERENCES'',N''updatedAt'',0), (N''AuthSessions'',N''SELECT'',NULL,1), (N''AuthSessions'',N''INSERT'',NULL,1),
(N''AuthSessions'',N''UPDATE'',NULL,0), (N''AuthSessions'',N''DELETE'',NULL,1), (N''AuthSessions'',N''ALTER'',NULL,0),
(N''AuthSessions'',N''CONTROL'',NULL,0), (N''AuthSessions'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthSessions'',N''REFERENCES'',NULL,0),
(N''AuthSessions'',N''SELECT'',N''id'',1), (N''AuthSessions'',N''UPDATE'',N''id'',0), (N''AuthSessions'',N''REFERENCES'',N''id'',0),
(N''AuthSessions'',N''SELECT'',N''userId'',1), (N''AuthSessions'',N''UPDATE'',N''userId'',0), (N''AuthSessions'',N''REFERENCES'',N''userId'',0),
(N''AuthSessions'',N''SELECT'',N''token'',1), (N''AuthSessions'',N''UPDATE'',N''token'',0), (N''AuthSessions'',N''REFERENCES'',N''token'',0),
(N''AuthSessions'',N''SELECT'',N''expiresAt'',1), (N''AuthSessions'',N''UPDATE'',N''expiresAt'',0), (N''AuthSessions'',N''REFERENCES'',N''expiresAt'',0),
(N''AuthSessions'',N''SELECT'',N''createdAt'',1), (N''AuthSessions'',N''UPDATE'',N''createdAt'',0), (N''AuthSessions'',N''REFERENCES'',N''createdAt'',0),
(N''AuthSessions'',N''SELECT'',N''updatedAt'',1), (N''AuthSessions'',N''UPDATE'',N''updatedAt'',0), (N''AuthSessions'',N''REFERENCES'',N''updatedAt'',0),
(N''AuthSessions'',N''SELECT'',N''ipAddress'',1), (N''AuthSessions'',N''UPDATE'',N''ipAddress'',0), (N''AuthSessions'',N''REFERENCES'',N''ipAddress'',0),
(N''AuthSessions'',N''SELECT'',N''userAgent'',1), (N''AuthSessions'',N''UPDATE'',N''userAgent'',0), (N''AuthSessions'',N''REFERENCES'',N''userAgent'',0),
(N''AuthVerifications'',N''SELECT'',NULL,1), (N''AuthVerifications'',N''INSERT'',NULL,1), (N''AuthVerifications'',N''UPDATE'',NULL,0),
(N''AuthVerifications'',N''DELETE'',NULL,1), (N''AuthVerifications'',N''ALTER'',NULL,0), (N''AuthVerifications'',N''CONTROL'',NULL,0),
(N''AuthVerifications'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthVerifications'',N''REFERENCES'',NULL,0), (N''AuthVerifications'',N''SELECT'',N''id'',1),
(N''AuthVerifications'',N''UPDATE'',N''id'',0), (N''AuthVerifications'',N''REFERENCES'',N''id'',0), (N''AuthVerifications'',N''SELECT'',N''identifier'',1),
(N''AuthVerifications'',N''UPDATE'',N''identifier'',0), (N''AuthVerifications'',N''REFERENCES'',N''identifier'',0), (N''AuthVerifications'',N''SELECT'',N''value'',1),
(N''AuthVerifications'',N''UPDATE'',N''value'',0), (N''AuthVerifications'',N''REFERENCES'',N''value'',0), (N''AuthVerifications'',N''SELECT'',N''expiresAt'',1),
(N''AuthVerifications'',N''UPDATE'',N''expiresAt'',0), (N''AuthVerifications'',N''REFERENCES'',N''expiresAt'',0), (N''AuthVerifications'',N''SELECT'',N''createdAt'',1),
(N''AuthVerifications'',N''UPDATE'',N''createdAt'',0), (N''AuthVerifications'',N''REFERENCES'',N''createdAt'',0), (N''AuthVerifications'',N''SELECT'',N''updatedAt'',1),
(N''AuthVerifications'',N''UPDATE'',N''updatedAt'',0), (N''AuthVerifications'',N''REFERENCES'',N''updatedAt'',0), (N''AuthSetupVerifications'',N''SELECT'',NULL,1),
(N''AuthSetupVerifications'',N''INSERT'',NULL,1), (N''AuthSetupVerifications'',N''UPDATE'',NULL,0), (N''AuthSetupVerifications'',N''DELETE'',NULL,1),
(N''AuthSetupVerifications'',N''ALTER'',NULL,0), (N''AuthSetupVerifications'',N''CONTROL'',NULL,0), (N''AuthSetupVerifications'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthSetupVerifications'',N''REFERENCES'',NULL,0), (N''AuthSetupVerifications'',N''SELECT'',N''id'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''id'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''id'',0), (N''AuthSetupVerifications'',N''SELECT'',N''identifier'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''identifier'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''identifier'',0), (N''AuthSetupVerifications'',N''SELECT'',N''value'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''value'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''value'',0), (N''AuthSetupVerifications'',N''SELECT'',N''expiresAt'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''expiresAt'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''expiresAt'',0), (N''AuthSetupVerifications'',N''SELECT'',N''createdAt'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''createdAt'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''createdAt'',0), (N''AuthSetupVerifications'',N''SELECT'',N''updatedAt'',1), (N''AuthSetupVerifications'',N''UPDATE'',N''updatedAt'',0),
(N''AuthSetupVerifications'',N''REFERENCES'',N''updatedAt'',0), (N''AuthRoleAssignments'',N''SELECT'',NULL,1), (N''AuthRoleAssignments'',N''INSERT'',NULL,0),
(N''AuthRoleAssignments'',N''UPDATE'',NULL,0), (N''AuthRoleAssignments'',N''DELETE'',NULL,0), (N''AuthRoleAssignments'',N''ALTER'',NULL,0),
(N''AuthRoleAssignments'',N''CONTROL'',NULL,0), (N''AuthRoleAssignments'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthRoleAssignments'',N''REFERENCES'',NULL,0),
(N''AuthRoleAssignments'',N''SELECT'',N''UserId'',1), (N''AuthRoleAssignments'',N''UPDATE'',N''UserId'',0), (N''AuthRoleAssignments'',N''REFERENCES'',N''UserId'',0),
(N''AuthRoleAssignments'',N''SELECT'',N''Role'',1), (N''AuthRoleAssignments'',N''UPDATE'',N''Role'',0), (N''AuthRoleAssignments'',N''REFERENCES'',N''Role'',0),
(N''AuthRoleAssignments'',N''SELECT'',N''CreatedAt'',1), (N''AuthRoleAssignments'',N''UPDATE'',N''CreatedAt'',0), (N''AuthRoleAssignments'',N''REFERENCES'',N''CreatedAt'',0),
(N''AuthInvitations'',N''SELECT'',NULL,1), (N''AuthInvitations'',N''INSERT'',NULL,0), (N''AuthInvitations'',N''UPDATE'',NULL,0),
(N''AuthInvitations'',N''DELETE'',NULL,0), (N''AuthInvitations'',N''ALTER'',NULL,0), (N''AuthInvitations'',N''CONTROL'',NULL,0),
(N''AuthInvitations'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthInvitations'',N''REFERENCES'',NULL,0), (N''AuthInvitations'',N''SELECT'',N''Id'',1),
(N''AuthInvitations'',N''UPDATE'',N''Id'',0), (N''AuthInvitations'',N''REFERENCES'',N''Id'',0), (N''AuthInvitations'',N''SELECT'',N''UserId'',1),
(N''AuthInvitations'',N''UPDATE'',N''UserId'',0), (N''AuthInvitations'',N''REFERENCES'',N''UserId'',0), (N''AuthInvitations'',N''SELECT'',N''InvitedBy'',1),
(N''AuthInvitations'',N''UPDATE'',N''InvitedBy'',0), (N''AuthInvitations'',N''REFERENCES'',N''InvitedBy'',0), (N''AuthInvitations'',N''SELECT'',N''CreatedAt'',1),
(N''AuthInvitations'',N''UPDATE'',N''CreatedAt'',0), (N''AuthInvitations'',N''REFERENCES'',N''CreatedAt'',0), (N''AuthInvitations'',N''SELECT'',N''ExpiresAt'',1),
(N''AuthInvitations'',N''UPDATE'',N''ExpiresAt'',0), (N''AuthInvitations'',N''REFERENCES'',N''ExpiresAt'',0), (N''AuthInvitations'',N''SELECT'',N''AcceptedAt'',1),
(N''AuthInvitations'',N''UPDATE'',N''AcceptedAt'',0), (N''AuthInvitations'',N''REFERENCES'',N''AcceptedAt'',0), (N''AuthNotifications'',N''SELECT'',NULL,1),
(N''AuthNotifications'',N''INSERT'',NULL,0), (N''AuthNotifications'',N''UPDATE'',NULL,0), (N''AuthNotifications'',N''DELETE'',NULL,0),
(N''AuthNotifications'',N''ALTER'',NULL,0), (N''AuthNotifications'',N''CONTROL'',NULL,0), (N''AuthNotifications'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthNotifications'',N''REFERENCES'',NULL,0), (N''AuthNotifications'',N''SELECT'',N''UserId'',1), (N''AuthNotifications'',N''UPDATE'',N''UserId'',0),
(N''AuthNotifications'',N''REFERENCES'',N''UserId'',0), (N''AuthNotifications'',N''SELECT'',N''CreatedAt'',1), (N''AuthNotifications'',N''UPDATE'',N''CreatedAt'',0),
(N''AuthNotifications'',N''REFERENCES'',N''CreatedAt'',0), (N''AuthNotifications'',N''SELECT'',N''DeliveredAt'',1), (N''AuthNotifications'',N''UPDATE'',N''DeliveredAt'',1),
(N''AuthNotifications'',N''REFERENCES'',N''DeliveredAt'',0), (N''ActivityEvents'',N''SELECT'',NULL,0), (N''ActivityEvents'',N''INSERT'',NULL,0),
(N''ActivityEvents'',N''UPDATE'',NULL,0), (N''ActivityEvents'',N''DELETE'',NULL,0), (N''ActivityEvents'',N''ALTER'',NULL,0),
(N''ActivityEvents'',N''CONTROL'',NULL,0), (N''ActivityEvents'',N''TAKE OWNERSHIP'',NULL,0), (N''ActivityEvents'',N''REFERENCES'',NULL,0),
(N''ActivityEvents'',N''SELECT'',N''Id'',0), (N''ActivityEvents'',N''UPDATE'',N''Id'',0), (N''ActivityEvents'',N''REFERENCES'',N''Id'',0),
(N''ActivityEvents'',N''SELECT'',N''OccurredAt'',0), (N''ActivityEvents'',N''UPDATE'',N''OccurredAt'',0), (N''ActivityEvents'',N''REFERENCES'',N''OccurredAt'',0),
(N''ActivityEvents'',N''SELECT'',N''EventType'',0), (N''ActivityEvents'',N''UPDATE'',N''EventType'',0), (N''ActivityEvents'',N''REFERENCES'',N''EventType'',0),
(N''ActivityEvents'',N''SELECT'',N''Outcome'',0), (N''ActivityEvents'',N''UPDATE'',N''Outcome'',0), (N''ActivityEvents'',N''REFERENCES'',N''Outcome'',0),
(N''ActivityEvents'',N''SELECT'',N''ActorKind'',0), (N''ActivityEvents'',N''UPDATE'',N''ActorKind'',0), (N''ActivityEvents'',N''REFERENCES'',N''ActorKind'',0),
(N''ActivityEvents'',N''SELECT'',N''ActingAccountId'',0), (N''ActivityEvents'',N''UPDATE'',N''ActingAccountId'',0), (N''ActivityEvents'',N''REFERENCES'',N''ActingAccountId'',0),
(N''ActivityEvents'',N''SELECT'',N''TargetAccountId'',0), (N''ActivityEvents'',N''UPDATE'',N''TargetAccountId'',0), (N''ActivityEvents'',N''REFERENCES'',N''TargetAccountId'',0),
(N''ActivityEvents'',N''SELECT'',N''ArticleId'',0), (N''ActivityEvents'',N''UPDATE'',N''ArticleId'',0), (N''ActivityEvents'',N''REFERENCES'',N''ArticleId'',0),
(N''ActivityEvents'',N''SELECT'',N''RevisionId'',0), (N''ActivityEvents'',N''UPDATE'',N''RevisionId'',0), (N''ActivityEvents'',N''REFERENCES'',N''RevisionId'',0),
(N''ActivityEvents'',N''SELECT'',N''Role'',0), (N''ActivityEvents'',N''UPDATE'',N''Role'',0), (N''ActivityEvents'',N''REFERENCES'',N''Role'',0),
(N''ActivityEvents'',N''SELECT'',N''Reason'',0), (N''ActivityEvents'',N''UPDATE'',N''Reason'',0), (N''ActivityEvents'',N''REFERENCES'',N''Reason'',0),
(N''ActivityEvents'',N''SELECT'',N''CorrelationId'',0), (N''ActivityEvents'',N''UPDATE'',N''CorrelationId'',0), (N''ActivityEvents'',N''REFERENCES'',N''CorrelationId'',0),
(N''AuthAuditEvents'',N''SELECT'',NULL,0), (N''AuthAuditEvents'',N''INSERT'',NULL,0), (N''AuthAuditEvents'',N''UPDATE'',NULL,0),
(N''AuthAuditEvents'',N''DELETE'',NULL,0), (N''AuthAuditEvents'',N''ALTER'',NULL,0), (N''AuthAuditEvents'',N''CONTROL'',NULL,0),
(N''AuthAuditEvents'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthAuditEvents'',N''REFERENCES'',NULL,0), (N''AuthAuditEvents'',N''SELECT'',N''Id'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''Id'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''Id'',0), (N''AuthAuditEvents'',N''SELECT'',N''ActingUserId'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''ActingUserId'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''ActingUserId'',0), (N''AuthAuditEvents'',N''SELECT'',N''TargetUserId'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''TargetUserId'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''TargetUserId'',0), (N''AuthAuditEvents'',N''SELECT'',N''Action'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''Action'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''Action'',0), (N''AuthAuditEvents'',N''SELECT'',N''Role'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''Role'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''Role'',0), (N''AuthAuditEvents'',N''SELECT'',N''CreatedAt'',0),
(N''AuthAuditEvents'',N''UPDATE'',N''CreatedAt'',0), (N''AuthAuditEvents'',N''REFERENCES'',N''CreatedAt'',0), (N''AuthSecurityBuckets'',N''SELECT'',NULL,0),
(N''AuthSecurityBuckets'',N''INSERT'',NULL,0), (N''AuthSecurityBuckets'',N''UPDATE'',NULL,0), (N''AuthSecurityBuckets'',N''DELETE'',NULL,0),
(N''AuthSecurityBuckets'',N''ALTER'',NULL,0), (N''AuthSecurityBuckets'',N''CONTROL'',NULL,0), (N''AuthSecurityBuckets'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthSecurityBuckets'',N''REFERENCES'',NULL,0), (N''AuthSecurityBuckets'',N''SELECT'',N''Slot'',0), (N''AuthSecurityBuckets'',N''UPDATE'',N''Slot'',0),
(N''AuthSecurityBuckets'',N''REFERENCES'',N''Slot'',0), (N''AuthSecurityBuckets'',N''SELECT'',N''EventType'',0), (N''AuthSecurityBuckets'',N''UPDATE'',N''EventType'',0),
(N''AuthSecurityBuckets'',N''REFERENCES'',N''EventType'',0), (N''AuthSecurityBuckets'',N''SELECT'',N''Id'',0), (N''AuthSecurityBuckets'',N''UPDATE'',N''Id'',0),
(N''AuthSecurityBuckets'',N''REFERENCES'',N''Id'',0), (N''AuthSecurityBuckets'',N''SELECT'',N''PeriodStart'',0), (N''AuthSecurityBuckets'',N''UPDATE'',N''PeriodStart'',0),
(N''AuthSecurityBuckets'',N''REFERENCES'',N''PeriodStart'',0), (N''AuthSecurityBuckets'',N''SELECT'',N''Attempts'',0), (N''AuthSecurityBuckets'',N''UPDATE'',N''Attempts'',0),
(N''AuthSecurityBuckets'',N''REFERENCES'',N''Attempts'',0), (N''AuthThrottleBuckets'',N''SELECT'',NULL,0), (N''AuthThrottleBuckets'',N''INSERT'',NULL,0),
(N''AuthThrottleBuckets'',N''UPDATE'',NULL,0), (N''AuthThrottleBuckets'',N''DELETE'',NULL,0), (N''AuthThrottleBuckets'',N''ALTER'',NULL,0),
(N''AuthThrottleBuckets'',N''CONTROL'',NULL,0), (N''AuthThrottleBuckets'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthThrottleBuckets'',N''REFERENCES'',NULL,0),
(N''AuthThrottleBuckets'',N''SELECT'',N''Bucket'',0), (N''AuthThrottleBuckets'',N''UPDATE'',N''Bucket'',0), (N''AuthThrottleBuckets'',N''REFERENCES'',N''Bucket'',0),
(N''AuthThrottleBuckets'',N''SELECT'',N''WindowStart'',0), (N''AuthThrottleBuckets'',N''UPDATE'',N''WindowStart'',0), (N''AuthThrottleBuckets'',N''REFERENCES'',N''WindowStart'',0),
(N''AuthThrottleBuckets'',N''SELECT'',N''Attempts'',0), (N''AuthThrottleBuckets'',N''UPDATE'',N''Attempts'',0), (N''AuthThrottleBuckets'',N''REFERENCES'',N''Attempts'',0),
(N''AuthManageAccount'',N''EXECUTE'',NULL,1), (N''AuthManageAccount'',N''ALTER'',NULL,0), (N''AuthManageAccount'',N''CONTROL'',NULL,0),
(N''AuthManageAccount'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthThrottle'',N''EXECUTE'',NULL,1), (N''AuthThrottle'',N''ALTER'',NULL,0),
(N''AuthThrottle'',N''CONTROL'',NULL,0), (N''AuthThrottle'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthBeginSession'',N''EXECUTE'',NULL,1),
(N''AuthBeginSession'',N''ALTER'',NULL,0), (N''AuthBeginSession'',N''CONTROL'',NULL,0), (N''AuthBeginSession'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthRecordSessionEvent'',N''EXECUTE'',NULL,1), (N''AuthRecordSessionEvent'',N''ALTER'',NULL,0), (N''AuthRecordSessionEvent'',N''CONTROL'',NULL,0),
(N''AuthRecordSessionEvent'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthCompletePassword'',N''EXECUTE'',NULL,1), (N''AuthCompletePassword'',N''ALTER'',NULL,0),
(N''AuthCompletePassword'',N''CONTROL'',NULL,0), (N''AuthCompletePassword'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthSecurityEvent'',N''EXECUTE'',NULL,1),
(N''AuthSecurityEvent'',N''ALTER'',NULL,0), (N''AuthSecurityEvent'',N''CONTROL'',NULL,0), (N''AuthSecurityEvent'',N''TAKE OWNERSHIP'',NULL,0),
(N''AuthListActivity'',N''EXECUTE'',NULL,1), (N''AuthListActivity'',N''ALTER'',NULL,0), (N''AuthListActivity'',N''CONTROL'',NULL,0),
(N''AuthListActivity'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthBootstrapAdministrator'',N''EXECUTE'',NULL,0), (N''AuthBootstrapAdministrator'',N''ALTER'',NULL,0),
(N''AuthBootstrapAdministrator'',N''CONTROL'',NULL,0), (N''AuthBootstrapAdministrator'',N''TAKE OWNERSHIP'',NULL,0), (N''AuthRecoverPending'',N''EXECUTE'',NULL,0),
(N''AuthRecoverPending'',N''ALTER'',NULL,0), (N''AuthRecoverPending'',N''CONTROL'',NULL,0), (N''AuthRecoverPending'',N''TAKE OWNERSHIP'',NULL,0);

DECLARE @Mismatch int;
SELECT @Mismatch=COUNT(*) FROM @Expected WHERE
 ISNULL(CASE WHEN ColumnName IS NULL THEN HAS_PERMS_BY_NAME(N''dbo.''+ObjectName,N''OBJECT'',PermissionName)
 ELSE HAS_PERMS_BY_NAME(N''dbo.''+ObjectName,N''OBJECT'',PermissionName,ColumnName,N''COLUMN'') END,0)<>Allowed;
IF @Mismatch<>0 THROW 53232,''Effective auth object/column permissions differ from the contract.'',1;
-- Check other visible user objects for unexpected read/write/execute paths too.
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY(VALUES(N''SELECT''),(N''CONTROL''),(N''ALTER''),(N''TAKE OWNERSHIP''),(N''INSERT''),(N''UPDATE''),(N''DELETE''),(N''EXECUTE''),(N''REFERENCES'')) p(PermissionName)
 WHERE o.is_ms_shipped=0 AND o.type IN(N''U'',N''V'',N''P'',N''FN'',N''IF'',N''TF'')
 AND NOT EXISTS(SELECT 1 FROM @Expected e WHERE e.ObjectName COLLATE Latin1_General_100_BIN2=o.name COLLATE Latin1_General_100_BIN2 AND s.name=N''dbo'')
 AND NOT(s.name=N''dbo'' AND o.name=N''PublicArticles'' AND p.PermissionName=N''SELECT'')
 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N''.''+QUOTENAME(o.name),N''OBJECT'',p.PermissionName)=1)
 THROW 53232,''Unexpected effective authority on another user object.'',1;

IF ISNULL(HAS_PERMS_BY_NAME(N''dbo.PublicArticles'',N''OBJECT'',N''SELECT''),0)<>@public THROW 53232,''Public article SELECT changed.'',1;
REVERT; SET @switched=0; END TRY BEGIN CATCH IF @switched=1 REVERT; THROW; END CATCH;';
 EXEC sys.sp_executesql @Postcheck,N'@public int',@public=@publicBefore;
 COMMIT TRANSACTION;
 SELECT CAST(1 AS bit) AS GrantsCommittedAndPostcheckPassed;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
-- EXECUTE AS USER is a database-context check, not proof of the real login's
-- server/Entra group authority. Run the status/probes and app as the ACTUAL user.
