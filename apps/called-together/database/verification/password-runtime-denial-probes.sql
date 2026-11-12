-- OWNER-RUN probes through the ACTUAL restricted connection, after status passes.
-- All DML predicates are zero-row; every statement has its own rolled-back
-- transaction. Operator calls also roll back even if incorrectly authorized.
-- Permission errors (229/230) alone count as forbidden-operation success;
-- triggers/business rejections do not. No data/identity/error text is returned.
SET NOCOUNT ON; SET XACT_ABORT OFF;
DECLARE @ExpectedUser sysname=N'REPLACE_RUNTIME_USER',@n int,@s int,@i int;
SET @n=@@TRANCOUNT; SET @s=XACT_STATE(); SET @i=CASE WHEN (@@OPTIONS & 2)=2 THEN 1 ELSE 0 END;
IF @n<>0 OR @s<>0 OR @i<>0 THROW 53230,'Use a clean runtime autocommit connection.',1;
IF DB_NAME() COLLATE Latin1_General_100_BIN2<>N'ct_password_auth_test' OR @ExpectedUser=N'REPLACE_RUNTIME_USER'
 OR USER_NAME() COLLATE Latin1_General_100_BIN2<>@ExpectedUser COLLATE Latin1_General_100_BIN2 OR USER_ID()<=4
 THROW 53230,'Wrong database or runtime identity.',1;
DECLARE @Tests TABLE(Id int IDENTITY PRIMARY KEY,CheckName sysname,Statement nvarchar(max),ShouldSucceed bit);
INSERT @Tests(CheckName,Statement,ShouldSucceed) VALUES
(N'UserInsert',N'INSERT dbo.AuthUsers(id,name,email,emailVerified,createdAt,updatedAt,actorId) SELECT N''00000000-0000-4000-8000-000000000001'',N''Permission probe'',N''permission-probe@example.invalid'',0,SYSUTCDATETIME(),SYSUTCDATETIME(),CONVERT(uniqueidentifier,''00000000-0000-4000-8000-000000000001'') WHERE 1=0;',0),
(N'UserDelete',N'DELETE dbo.AuthUsers WHERE 1=0;',0),
(N'UserDisable',N'UPDATE dbo.AuthUsers SET disabled=disabled WHERE 1=0;',0),
(N'UserActivate',N'UPDATE dbo.AuthUsers SET activatedAt=activatedAt WHERE 1=0;',0),
(N'UserIdentity',N'UPDATE dbo.AuthUsers SET actorId=actorId WHERE 1=0;',0),
(N'UserName',N'UPDATE dbo.AuthUsers SET name=name WHERE 1=0;',0),
(N'UserEmail',N'UPDATE dbo.AuthUsers SET email=email WHERE 1=0;',0),
(N'UserLibraryColumns',N'UPDATE dbo.AuthUsers SET emailVerified=emailVerified,updatedAt=updatedAt WHERE 1=0;',1),
(N'CredentialLibraryColumns',N'UPDATE dbo.AuthAccounts SET password=password,updatedAt=updatedAt WHERE 1=0;',1),
(N'CredentialDelete',N'DELETE dbo.AuthAccounts WHERE 1=0;',0),
(N'CredentialIdentity',N'UPDATE dbo.AuthAccounts SET userId=userId WHERE 1=0;',0),
(N'SessionUpdate',N'UPDATE dbo.AuthSessions SET expiresAt=expiresAt WHERE 1=0;',0),
(N'VerificationUpdate',N'UPDATE dbo.AuthVerifications SET value=value WHERE 1=0;',0),
(N'SetupVerificationUpdate',N'UPDATE dbo.AuthSetupVerifications SET value=value WHERE 1=0;',0),
(N'NotificationDelivery',N'UPDATE dbo.AuthNotifications SET DeliveredAt=DeliveredAt WHERE 1=0;',1),
(N'NotificationOtherColumn',N'UPDATE dbo.AuthNotifications SET CreatedAt=CreatedAt WHERE 1=0;',0),
(N'RoleInsert',N'INSERT dbo.AuthRoleAssignments(UserId,Role) SELECT N''00000000-0000-4000-8000-000000000001'',''Writer'' WHERE 1=0;',0),
(N'RoleUpdate',N'UPDATE dbo.AuthRoleAssignments SET Role=''Writer'' WHERE 1=0;',0),
(N'RoleDelete',N'DELETE dbo.AuthRoleAssignments WHERE 1=0;',0),
(N'InvitationUpdate',N'UPDATE dbo.AuthInvitations SET AcceptedAt=AcceptedAt WHERE 1=0;',0),
(N'ActivityInsert',N'INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,Reason,CorrelationId) SELECT NEWID(),''login'',''success'',''system'',''completed'',NEWID() WHERE 1=0;',0),
(N'ActivityUpdate',N'UPDATE dbo.ActivityEvents SET Reason=''completed'' WHERE 1=0;',0),
(N'ActivityDelete',N'DELETE dbo.ActivityEvents WHERE 1=0;',0),
(N'LegacyAuditInsert',N'INSERT dbo.AuthAuditEvents(Id,TargetUserId,Action) SELECT NEWID(),N''00000000-0000-4000-8000-000000000001'',''sign_in'' WHERE 1=0;',0),
(N'LegacyAuditUpdate',N'UPDATE dbo.AuthAuditEvents SET Action=''sign_in'' WHERE 1=0;',0),
(N'LegacyAuditDelete',N'DELETE dbo.AuthAuditEvents WHERE 1=0;',0),
(N'ThrottleStorageUpdate',N'UPDATE dbo.AuthThrottleBuckets SET Attempts=1 WHERE 1=0;',0),
(N'SecurityStorageUpdate',N'UPDATE dbo.AuthSecurityBuckets SET Attempts=1 WHERE 1=0;',0),
(N'OperatorBootstrap',N'EXEC dbo.AuthBootstrapAdministrator @Email=N''permission-probe@example.invalid'',@Name=N''Permission probe'';',0),
(N'OperatorRecovery',N'EXEC dbo.AuthRecoverPending @Email=N''permission-probe@example.invalid'';',0);
DECLARE @Results TABLE(CheckName sysname,Passed bit,SafeSqlNumber int NULL);
DECLARE @j int=1,@count int=(SELECT COUNT(*) FROM @Tests),@name sysname,@statement nvarchar(max),@wanted bit,@succeeded bit,@error int;
WHILE @j<=@count
BEGIN
 SELECT @name=CheckName,@statement=Statement,@wanted=ShouldSucceed FROM @Tests WHERE Id=@j;
 SET @succeeded=0; SET @error=NULL;
 BEGIN TRANSACTION;
 BEGIN TRY
  EXEC sys.sp_executesql @statement;
  SET @succeeded=1;
 END TRY
 BEGIN CATCH
  SET @error=ERROR_NUMBER();
 END CATCH;
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 INSERT @Results VALUES(@name,CASE WHEN (@wanted=1 AND @succeeded=1) OR (@wanted=0 AND @succeeded=0 AND @error IN(229,230)) THEN 1 ELSE 0 END,CASE WHEN @error IN(229,230) THEN @error ELSE NULL END);
 SET @j+=1;
END;
SELECT CheckName,Passed,SafeSqlNumber,MIN(CONVERT(int,Passed)) OVER() AS AllPassed FROM @Results ORDER BY CheckName;
IF EXISTS(SELECT 1 FROM @Results WHERE Passed=0) THROW 53233,'A restricted-principal probe failed; stop for owner review.',1;
SET @n=@@TRANCOUNT; SET @s=XACT_STATE();
SELECT @n AS FinalOpenTransactions,@s AS FinalTransactionState;
