-- READ-ONLY. Run through the ACTUAL runtime connection, not EXECUTE AS owner.
-- Replace expected principal; returns only pass flags, never identities or data.
DECLARE @ExpectedUser sysname=N'REPLACE_RUNTIME_USER', @n int, @s int, @i int;
SET @n=@@TRANCOUNT; SET @s=XACT_STATE(); SET @i=CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
IF @n<>0 OR @s<>0 OR @i<>0 THROW 53230,'Use a clean autocommit connection.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'ct_password_auth_test' THROW 53230,'Wrong verification database.',1;
IF @ExpectedUser=N'REPLACE_RUNTIME_USER' OR USER_NAME() COLLATE Latin1_General_100_BIN2<>@ExpectedUser COLLATE Latin1_General_100_BIN2
 THROW 53230,'Actual connection does not use the expected runtime user.',1;
-- Effective checks run as the selected user (or the actual connected identity).
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.principal_id=t.principal_id WHERE p.is_fixed_role=1 AND p.name<>N'public')
 THROW 53231,'Fixed runtime roles rejected.',1;
IF USER_ID()=1 OR IS_MEMBER(N'db_owner')=1 OR IS_MEMBER(N'db_ddladmin')=1 OR IS_MEMBER(N'db_securityadmin')=1
 THROW 53231,'Privileged runtime context rejected.',1;
IF EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'DATABASE') WHERE permission_name NOT IN
 (N'CONNECT',N'VIEW DEFINITION',N'VIEW ANY COLUMN ENCRYPTION KEY DEFINITION',N'VIEW ANY COLUMN MASTER KEY DEFINITION'))
 THROW 53231,'Broad database permissions rejected.',1;
IF EXISTS(SELECT 1 FROM sys.schemas s CROSS APPLY sys.fn_my_permissions(s.name,N'SCHEMA') p
 WHERE s.name NOT IN(N'sys',N'INFORMATION_SCHEMA') AND p.permission_name IN
 (N'CONTROL',N'ALTER',N'TAKE OWNERSHIP',N'SELECT',N'INSERT',N'UPDATE',N'DELETE',N'EXECUTE',N'REFERENCES'))
 THROW 53231,'Broad schema permissions rejected.',1;
IF EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.schemas s ON s.principal_id=t.principal_id)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.objects o ON o.principal_id=t.principal_id WHERE o.is_ms_shipped=0)
 OR EXISTS(SELECT 1 FROM sys.user_token t JOIN sys.database_principals p ON p.owning_principal_id=t.principal_id)
 THROW 53231,'Runtime token owns a schema, object or principal.',1;
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY(VALUES(N'CONTROL'),(N'ALTER'),(N'TAKE OWNERSHIP'),(N'REFERENCES')) p(PermissionName)
 WHERE o.is_ms_shipped=0 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',p.PermissionName)=1)
 OR EXISTS(SELECT 1 FROM sys.database_principals p WHERE p.principal_id<>USER_ID()
 AND HAS_PERMS_BY_NAME(p.name,N'USER',N'IMPERSONATE')=1)
 OR EXISTS(SELECT 1 FROM sys.database_permissions p JOIN sys.user_token t ON t.principal_id=p.grantee_principal_id WHERE p.state='W' OR (p.class=4 AND p.state IN('G','W')))
 THROW 53231,'Object authority, impersonation or grant options rejected.',1;
IF ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0)<>5
BEGIN
IF
 (ISNULL(IS_SRVROLEMEMBER(N'sysadmin'),1)<>0 OR ISNULL(HAS_PERMS_BY_NAME(NULL,N'SERVER',N'CONTROL SERVER'),1)<>0
 OR EXISTS(SELECT 1 FROM sys.fn_my_permissions(NULL,N'SERVER') WHERE permission_name NOT IN(N'CONNECT SQL',N'VIEW ANY DATABASE')))
 THROW 53231,'Server-level authority is unsafe or unobservable.',1;
END;
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

DECLARE @Mismatch int;
SELECT @Mismatch=COUNT(*) FROM @Expected WHERE
 ISNULL(CASE WHEN ColumnName IS NULL THEN HAS_PERMS_BY_NAME(N'dbo.'+ObjectName,N'OBJECT',PermissionName)
 ELSE HAS_PERMS_BY_NAME(N'dbo.'+ObjectName,N'OBJECT',PermissionName,ColumnName,N'COLUMN') END,0)<>Allowed;
IF @Mismatch<>0 THROW 53232,'Effective auth object/column permissions differ from the contract.',1;
-- Check other visible user objects for unexpected read/write/execute paths too.
IF EXISTS(SELECT 1 FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
 CROSS APPLY(VALUES(N'SELECT'),(N'CONTROL'),(N'ALTER'),(N'TAKE OWNERSHIP'),(N'INSERT'),(N'UPDATE'),(N'DELETE'),(N'EXECUTE'),(N'REFERENCES')) p(PermissionName)
 WHERE o.is_ms_shipped=0 AND o.type IN(N'U',N'V',N'P',N'FN',N'IF',N'TF')
 AND NOT EXISTS(SELECT 1 FROM @Expected e WHERE e.ObjectName COLLATE Latin1_General_100_BIN2=o.name COLLATE Latin1_General_100_BIN2 AND s.name=N'dbo')
 AND NOT(s.name=N'dbo' AND o.name=N'PublicArticles' AND p.PermissionName=N'SELECT')
 AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',p.PermissionName)=1)
 THROW 53232,'Unexpected effective authority on another user object.',1;

SELECT CAST(1 AS bit) AS EffectiveAuthContractPassed,
 CAST(CASE WHEN HAS_PERMS_BY_NAME(N'dbo.PublicArticles',N'OBJECT',N'SELECT')=1 THEN 1 ELSE 0 END AS bit) AS PublicArticleSelect;
-- Require both flags=1 for the app; this script never adds public permissions.
