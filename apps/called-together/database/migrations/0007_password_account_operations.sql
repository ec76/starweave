-- Procedures remain first in their dynamic batches under the migration transaction.
EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.AuthBootstrapAdministrator @Email nvarchar(254), @Name nvarchar(200)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRANSACTION;
 BEGIN TRY
  DECLARE @lock int, @id nvarchar(36)=LOWER(CONVERT(nvarchar(36),NEWID())), @now datetime2(3)=SYSUTCDATETIME();
  EXEC @lock=sys.sp_getapplock @Resource=N''CalledTogether:accounts:administration'',@LockMode=''Exclusive'',@LockOwner=''Transaction'',@LockTimeout=5000;
  IF @lock<0 THROW 53201,''Account administration is busy.'',1;
  IF EXISTS(SELECT 1 FROM dbo.AuthUsers) THROW 53202,''Bootstrap requires an empty account store.'',1;
  IF @Email<>LOWER(@Email) COLLATE Latin1_General_100_BIN2 OR LEN(LTRIM(RTRIM(@Name)))=0 THROW 53203,''Invalid account.'',1;
  INSERT dbo.EditorialActors(Id,Issuer,Subject,DisplayName) VALUES(CONVERT(uniqueidentifier,@id),N''urn:called-together:users'',@id,@Name);
  INSERT dbo.AuthUsers(id,name,email,emailVerified,createdAt,updatedAt,actorId) VALUES(@id,@Name,@Email,0,@now,@now,CONVERT(uniqueidentifier,@id));
  INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@id,''Administrator'');
  INSERT dbo.AuthNotifications(UserId) VALUES(@id);
  INSERT dbo.AuthInvitations(Id,UserId,CreatedAt,ExpiresAt) VALUES(NEWID(),@id,@now,DATEADD(day,7,@now));
  INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,TargetAccountId,Role,Reason,CorrelationId)
    VALUES(NEWID(),''account_bootstrapped'',''success'',''operator'',@id,''Administrator'',''completed'',NEWID());
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH
END';

EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.AuthManageAccount
 @SessionId nvarchar(36),@Action varchar(30),@TargetId nvarchar(36)=NULL,
 @Email nvarchar(254)=NULL,@Name nvarchar(200)=NULL,@Role varchar(20)=NULL,
 @Roles nvarchar(100)=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRANSACTION;
 BEGIN TRY
  DECLARE @lock int,@actor nvarchar(36),@now datetime2(3)=SYSUTCDATETIME(),@event varchar(40),@correlation uniqueidentifier=NEWID();
  EXEC @lock=sys.sp_getapplock @Resource=N''CalledTogether:accounts:administration'',@LockMode=''Exclusive'',@LockOwner=''Transaction'',@LockTimeout=5000;
  IF @lock<0 THROW 53201,''Account administration is busy.'',1;
  SET @now=SYSUTCDATETIME();
  SELECT @actor=u.id FROM dbo.AuthSessions s JOIN dbo.AuthUsers u ON u.id=s.userId
    JOIN dbo.AuthRoleAssignments r ON r.UserId=u.id AND r.Role=''Administrator''
    WHERE s.id=@SessionId AND s.expiresAt>@now AND u.disabled=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1
      AND EXISTS(SELECT 1 FROM dbo.AuthInvitations i WHERE i.UserId=u.id AND i.AcceptedAt IS NOT NULL);
  IF @actor IS NULL THROW 53204,''Administrator required.'',1;
  IF @Action IS NULL OR @Action NOT IN (''create'',''grant_role'',''revoke_role'',''enable'',''disable'',''revoke_sessions'') THROW 53203,''Invalid account operation.'',1;
  IF @Action=''create''
  BEGIN
   IF @Email IS NULL OR @Name IS NULL OR LEN(LTRIM(RTRIM(@Name)))=0 OR @Email<>LOWER(@Email) COLLATE Latin1_General_100_BIN2 OR ISJSON(@Roles)<>1 OR @Roles IS NULL OR LEFT(LTRIM(@Roles),1)<>''['' THROW 53203,''Invalid account.'',1;
   IF NOT EXISTS(SELECT 1 FROM OPENJSON(@Roles)) OR EXISTS(SELECT 1 FROM OPENJSON(@Roles) WHERE type<>1 OR value NOT IN (''Writer'',''Approver'',''Administrator'')) THROW 53203,''Assign at least one valid role.'',1;
   SET @TargetId=LOWER(CONVERT(nvarchar(36),NEWID()));
   INSERT dbo.EditorialActors(Id,Issuer,Subject,DisplayName) VALUES(CONVERT(uniqueidentifier,@TargetId),N''urn:called-together:users'',@TargetId,@Name);
   INSERT dbo.AuthUsers(id,name,email,emailVerified,createdAt,updatedAt,actorId) VALUES(@TargetId,@Name,@Email,0,@now,@now,CONVERT(uniqueidentifier,@TargetId));
   INSERT dbo.AuthRoleAssignments(UserId,Role) SELECT DISTINCT @TargetId,value FROM OPENJSON(@Roles);
   INSERT dbo.AuthInvitations(Id,UserId,InvitedBy,CreatedAt,ExpiresAt) VALUES(NEWID(),@TargetId,@actor,@now,DATEADD(day,7,@now));
   INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,Role,Reason,CorrelationId)
     SELECT NEWID(),''role_granted'',''success'',''account'',@actor,@TargetId,value,''completed'',@correlation FROM (SELECT DISTINCT value FROM OPENJSON(@Roles)) roles;
   INSERT dbo.AuthNotifications(UserId) VALUES(@TargetId);
   SET @event=''account_created'';
  END
  ELSE
  BEGIN
   IF NOT EXISTS(SELECT 1 FROM dbo.AuthUsers WHERE id=@TargetId) THROW 53203,''Unknown account.'',1;
   IF @Action IN (''grant_role'',''revoke_role'') AND (@Role IS NULL OR @Role NOT IN (''Writer'',''Approver'',''Administrator'')) THROW 53203,''Invalid role.'',1;
   IF @Action=''grant_role''
   BEGIN
    IF EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments WHERE UserId=@TargetId AND Role=@Role) THROW 53203,''Role already assigned.'',1;
    INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@TargetId,@Role);
   END
   IF @Action=''revoke_role''
   BEGIN
    DELETE dbo.AuthRoleAssignments WHERE UserId=@TargetId AND Role=@Role;
    IF @@ROWCOUNT<>1 THROW 53203,''Role not assigned.'',1;
   END
   IF @Action IN (''disable'',''enable'') UPDATE dbo.AuthUsers SET disabled=CASE WHEN @Action=''disable'' THEN 1 ELSE 0 END WHERE id=@TargetId;
   IF NOT EXISTS(SELECT 1 FROM dbo.AuthUsers u JOIN dbo.AuthRoleAssignments r ON r.UserId=u.id AND r.Role=''Administrator''
       WHERE u.disabled=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1 AND EXISTS(SELECT 1 FROM dbo.AuthInvitations i WHERE i.UserId=u.id AND i.AcceptedAt IS NOT NULL))
     THROW 53205,''An active administrator must remain.'',1;
   DELETE dbo.AuthSessions WHERE userId=@TargetId;
   INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,Reason,CorrelationId)
     VALUES(NEWID(),''sessions_revoked'',''success'',''account'',@actor,@TargetId,''completed'',@correlation);
   SET @event=CASE @Action WHEN ''grant_role'' THEN ''role_granted'' WHEN ''revoke_role'' THEN ''role_revoked'' WHEN ''disable'' THEN ''account_disabled'' WHEN ''enable'' THEN ''account_enabled'' ELSE ''sessions_revoked'' END;
   UPDATE dbo.AuthUsers SET updatedAt=@now WHERE id=@TargetId;
  END
  IF @Action<>''revoke_sessions''
  INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,Role,Reason,CorrelationId)
    VALUES(NEWID(),@event,''success'',''account'',@actor,@TargetId,CASE WHEN @Action IN (''grant_role'',''revoke_role'') THEN @Role END,''completed'',@correlation);
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH
END';

EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.AuthBeginSession @UserId nvarchar(36)
AS
BEGIN
 SET NOCOUNT ON;
 IF @@TRANCOUNT=0 THROW 53206,''An application transaction is required.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.AuthUsers u JOIN dbo.AuthInvitations i ON i.UserId=u.id
    WHERE u.id=@UserId AND u.disabled=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1 AND i.AcceptedAt IS NOT NULL)
    THROW 53207,''Account unavailable.'',1;
END';

EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.AuthRecordSessionEvent @UserId nvarchar(36),@Action varchar(30)
AS
BEGIN
 SET NOCOUNT ON;
 IF @@TRANCOUNT=0 OR @Action IS NULL OR @Action NOT IN (''sign_in'',''sign_out'') THROW 53206,''Invalid audit transaction.'',1;
 INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,Reason,CorrelationId)
 VALUES(NEWID(),CASE @Action WHEN ''sign_in'' THEN ''login'' ELSE ''logout'' END,''success'',''account'',@UserId,@UserId,''completed'',NEWID());
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthCompletePassword @UserId nvarchar(36),@Purpose varchar(10)
AS
BEGIN
 SET NOCOUNT ON;
 IF @@TRANCOUNT=0 OR @Purpose NOT IN (''setup'',''reset'') THROW 53206,''Invalid password transaction.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.AuthUsers u JOIN dbo.AuthInvitations i ON i.UserId=u.id WHERE u.id=@UserId AND u.disabled=0
   AND ((@Purpose=''setup'' AND u.activatedAt IS NULL AND (i.AcceptedAt IS NOT NULL OR i.ExpiresAt>SYSUTCDATETIME()))
     OR (@Purpose=''reset'' AND u.activatedAt IS NOT NULL AND u.emailVerified=1 AND i.AcceptedAt IS NOT NULL))) THROW 53207,''Account unavailable.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.AuthAccounts WHERE userId=@UserId AND providerId=N''credential'' AND password IS NOT NULL) THROW 53207,''Credential required.'',1;
 UPDATE dbo.AuthUsers SET activatedAt=COALESCE(activatedAt,SYSUTCDATETIME()),emailVerified=1,updatedAt=SYSUTCDATETIME() WHERE id=@UserId;
 UPDATE dbo.AuthInvitations SET AcceptedAt=COALESCE(AcceptedAt,SYSUTCDATETIME()) WHERE UserId=@UserId;
 INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,TargetAccountId,Reason,CorrelationId)
 VALUES(NEWID(),CASE @Purpose WHEN ''setup'' THEN ''setup_completed'' ELSE ''password_reset'' END,''success'',''system'',@UserId,''completed'',NEWID());
 IF @Purpose=''reset'' INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,TargetAccountId,Reason,CorrelationId)
 VALUES(NEWID(),''sessions_revoked'',''success'',''system'',@UserId,''completed'',NEWID());
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthSecurityEvent @EventType varchar(30)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @EventType IS NULL OR @EventType NOT IN (''login_failed'',''code_requested'',''code_rejected'',''reset_failed'') THROW 53203,''Invalid security category.'',1;
 BEGIN TRANSACTION;
 BEGIN TRY
  DECLARE @hour int=DATEDIFF(hour,CONVERT(datetime2,''20200101''),SYSUTCDATETIME()),@slot smallint,@period datetime2(3);
  SET @slot=@hour%168; SET @period=DATEADD(hour,@hour,CONVERT(datetime2,''20200101''));
  IF EXISTS(SELECT 1 FROM dbo.AuthSecurityBuckets WITH(UPDLOCK,HOLDLOCK) WHERE Slot=@slot AND EventType=@EventType)
    UPDATE dbo.AuthSecurityBuckets SET Id=CASE WHEN PeriodStart=@period THEN Id ELSE NEWID() END,
      Attempts=CASE WHEN PeriodStart<>@period THEN 1 WHEN Attempts<100000 THEN Attempts+1 ELSE Attempts END,PeriodStart=@period WHERE Slot=@slot AND EventType=@EventType;
  ELSE INSERT dbo.AuthSecurityBuckets(Slot,EventType,Id,PeriodStart,Attempts) VALUES(@slot,@EventType,NEWID(),@period,1);
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthListActivity @SessionId nvarchar(36),@Page int=1,@AccountId nvarchar(36)=NULL,@EventType varchar(40)=NULL,@From datetime2(3)=NULL,@Until datetime2(3)=NULL
AS
BEGIN
 SET NOCOUNT ON;
 IF @Page IS NULL OR @Page<1 OR @Page>10000 THROW 53203,''Invalid page.'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.AuthSessions s JOIN dbo.AuthUsers u ON u.id=s.userId JOIN dbo.AuthRoleAssignments r ON r.UserId=u.id AND r.Role=''Administrator''
   WHERE s.id=@SessionId AND s.expiresAt>SYSUTCDATETIME() AND u.disabled=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1 AND EXISTS(SELECT 1 FROM dbo.AuthInvitations i WHERE i.UserId=u.id AND i.AcceptedAt IS NOT NULL)) THROW 53204,''Administrator required.'',1;
 WITH events AS (
 SELECT Id,OccurredAt,EventType COLLATE Latin1_General_100_BIN2 AS EventType,Outcome COLLATE Latin1_General_100_BIN2 AS Outcome,ActorKind COLLATE Latin1_General_100_BIN2 AS ActorKind,ActingAccountId COLLATE Latin1_General_100_BIN2 AS ActingAccountId,TargetAccountId COLLATE Latin1_General_100_BIN2 AS TargetAccountId,ArticleId,RevisionId,Role COLLATE Latin1_General_100_BIN2 AS Role,Reason COLLATE Latin1_General_100_BIN2 AS Reason,CorrelationId,1 AS Attempts FROM dbo.ActivityEvents
 UNION ALL
 SELECT Id,PeriodStart,EventType COLLATE Latin1_General_100_BIN2,CASE WHEN EventType=''code_requested'' THEN ''success'' ELSE ''failure'' END COLLATE Latin1_General_100_BIN2,''system'' COLLATE Latin1_General_100_BIN2,CAST(NULL AS nvarchar(36)) COLLATE Latin1_General_100_BIN2,CAST(NULL AS nvarchar(36)) COLLATE Latin1_General_100_BIN2,NULL,NULL,CAST(NULL AS varchar(20)) COLLATE Latin1_General_100_BIN2,''aggregate'' COLLATE Latin1_General_100_BIN2,Id,Attempts FROM dbo.AuthSecurityBuckets WHERE PeriodStart>DATEADD(day,-7,SYSUTCDATETIME()))
 SELECT Id AS id,OccurredAt AS occurredAt,EventType AS eventType,Outcome AS outcome,ActorKind AS actorKind,ActingAccountId AS actingAccountId,TargetAccountId AS targetAccountId,
 ArticleId AS articleId,RevisionId AS revisionId,Role AS role,Reason AS reason,CorrelationId AS correlationId,Attempts AS attempts FROM events
 WHERE (@AccountId IS NULL OR ActingAccountId=@AccountId OR TargetAccountId=@AccountId) AND (@EventType IS NULL OR EventType=@EventType)
 AND (@From IS NULL OR OccurredAt>=@From) AND (@Until IS NULL OR OccurredAt<@Until)
 ORDER BY OccurredAt DESC,Id OFFSET ((@Page-1)*50) ROWS FETCH NEXT 51 ROWS ONLY;
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthRecoverPending @Email nvarchar(254)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRANSACTION;
 BEGIN TRY
  DECLARE @lock int,@id nvarchar(36),@disabled bit;
  EXEC @lock=sys.sp_getapplock @Resource=N''CalledTogether:accounts:administration'',@LockMode=''Exclusive'',@LockOwner=''Transaction'',@LockTimeout=5000;
  IF @lock<0 THROW 53201,''Account administration is busy.'',1;
  IF (SELECT COUNT(*) FROM dbo.AuthUsers)<>1 THROW 53208,''Recovery requires exactly one pending account.'',1;
  SELECT @id=id,@disabled=disabled FROM dbo.AuthUsers WHERE email=@Email AND activatedAt IS NULL;
  IF @id IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments WHERE UserId=@id AND Role=''Administrator'') OR EXISTS(SELECT 1 FROM dbo.AuthAccounts WHERE userId=@id AND password IS NOT NULL) THROW 53208,''Only unactivated accounts can be renewed.'',1;
  UPDATE dbo.AuthUsers SET disabled=0,updatedAt=SYSUTCDATETIME() WHERE id=@id;
  UPDATE dbo.AuthInvitations SET ExpiresAt=DATEADD(day,7,SYSUTCDATETIME()) WHERE UserId=@id;
  UPDATE dbo.AuthNotifications SET DeliveredAt=NULL WHERE UserId=@id;
  INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,TargetAccountId,Reason,CorrelationId)
   VALUES(NEWID(),''invitation_renewed'',''success'',''operator'',@id,''completed'',NEWID());
  IF @disabled=1 INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,TargetAccountId,Reason,CorrelationId)
   VALUES(NEWID(),''account_enabled'',''success'',''operator'',@id,''completed'',NEWID());
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH
END';
