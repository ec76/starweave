-- EXEC keeps CREATE PROCEDURE first in its batch, without GO, under the migration transaction.
EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthManageAccount
    @SessionId nvarchar(36), @Action varchar(30), @TargetId nvarchar(36) = NULL,
    @Email nvarchar(254) = NULL, @Name nvarchar(200) = NULL, @Role varchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @lock int, @actor nvarchar(36), @now datetime2(3) = SYSUTCDATETIME();
        EXEC @lock = sys.sp_getapplock @Resource = N''CalledTogether:accounts:administration'', @LockMode = ''Exclusive'', @LockOwner = ''Transaction'', @LockTimeout = 5000;
        IF @lock < 0 THROW 53001, ''Account administration is busy.'', 1;
        SELECT @actor = s.userId FROM dbo.AuthSessions s
            JOIN dbo.AuthUsers u ON u.id = s.userId AND u.disabled = 0
            JOIN dbo.AuthRoleAssignments r ON r.UserId = u.id AND r.Role = ''Administrator''
            WHERE s.id = @SessionId AND s.expiresAt > @now;
        IF @actor IS NULL THROW 53002, ''Administrator access required.'', 1;
        IF @Action NOT IN (''invite'', ''grant_role'', ''revoke_role'', ''disable'', ''revoke_sessions'') THROW 53003, ''Invalid account operation.'', 1;
        IF @Action = ''invite''
        BEGIN
            IF @Email IS NULL OR @Name IS NULL OR LEN(LTRIM(RTRIM(@Name))) = 0 OR @Email <> LOWER(@Email) COLLATE Latin1_General_100_BIN2 THROW 53003, ''Invalid invitation.'', 1;
            IF EXISTS (SELECT 1 FROM dbo.AuthUsers WHERE email = @Email) THROW 53004, ''Account already exists; invitation cannot link identities.'', 1;
            SET @TargetId = LOWER(CONVERT(nvarchar(36), NEWID()));
            INSERT dbo.EditorialActors (Id, Issuer, Subject, DisplayName) VALUES (CONVERT(uniqueidentifier, @TargetId), N''urn:called-together:users'', @TargetId, @Name);
            INSERT dbo.AuthUsers(id, name, email, emailVerified, createdAt, updatedAt, actorId)
                VALUES (@TargetId, @Name, @Email, 0, @now, @now, CONVERT(uniqueidentifier, @TargetId));
            INSERT dbo.AuthInvitations(Id, UserId, InvitedBy, CreatedAt, ExpiresAt)
                VALUES (NEWID(), @TargetId, @actor, @now, DATEADD(day, 7, @now));
        END
        ELSE IF NOT EXISTS (SELECT 1 FROM dbo.AuthUsers WHERE id = @TargetId) THROW 53003, ''Unknown account.'', 1;
        IF @Action IN (''grant_role'', ''revoke_role'') AND (@Role IS NULL OR @Role NOT IN (''Writer'', ''Approver'', ''Administrator'')) THROW 53003, ''Invalid role.'', 1;
        IF @Action = ''grant_role'' AND NOT EXISTS (SELECT 1 FROM dbo.AuthRoleAssignments WHERE UserId = @TargetId AND Role = @Role)
            INSERT dbo.AuthRoleAssignments(UserId, Role) VALUES (@TargetId, @Role);
        IF @Action = ''revoke_role'' DELETE dbo.AuthRoleAssignments WHERE UserId = @TargetId AND Role = @Role;
        IF @Action = ''disable'' UPDATE dbo.AuthUsers SET disabled = 1, updatedAt = @now WHERE id = @TargetId;
        IF NOT EXISTS (SELECT 1 FROM dbo.AuthUsers u JOIN dbo.AuthRoleAssignments r ON r.UserId = u.id WHERE u.disabled = 0 AND r.Role = ''Administrator'')
            THROW 53005, ''Cannot remove or disable the last active administrator.'', 1;
        -- Changing roles ends all sessions, including the acting session if it targets itself.
        IF @Action <> ''invite'' DELETE dbo.AuthSessions WHERE userId = @TargetId;
        INSERT dbo.AuthAuditEvents(Id, ActingUserId, TargetUserId, Action, Role)
            VALUES (NEWID(), @actor, @TargetId, @Action, CASE WHEN @Action IN (''grant_role'', ''revoke_role'') THEN @Role ELSE NULL END);
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthBootstrapAdministrator @Email nvarchar(254), @Name nvarchar(200)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    BEGIN TRY
        DECLARE @lock int, @id nvarchar(36) = LOWER(CONVERT(nvarchar(36), NEWID())), @now datetime2(3) = SYSUTCDATETIME();
        EXEC @lock = sys.sp_getapplock @Resource = N''CalledTogether:accounts:administration'', @LockMode = ''Exclusive'', @LockOwner = ''Transaction'', @LockTimeout = 5000;
        IF @lock < 0 THROW 53001, ''Account administration is busy.'', 1;
        IF EXISTS (SELECT 1 FROM dbo.AuthUsers u JOIN dbo.AuthRoleAssignments r ON r.UserId = u.id WHERE u.disabled = 0 AND r.Role = ''Administrator'')
            THROW 53006, ''An active administrator already exists.'', 1;
        IF EXISTS (SELECT 1 FROM dbo.AuthUsers WHERE email = @Email) THROW 53004, ''Bootstrap cannot link an existing identity.'', 1;
        IF @Email <> LOWER(@Email) COLLATE Latin1_General_100_BIN2 OR LEN(LTRIM(RTRIM(@Name))) = 0 THROW 53003, ''Invalid bootstrap account.'', 1;
        INSERT dbo.EditorialActors(Id, Issuer, Subject, DisplayName) VALUES (CONVERT(uniqueidentifier, @id), N''urn:called-together:users'', @id, @Name);
        INSERT dbo.AuthUsers(id, name, email, emailVerified, createdAt, updatedAt, actorId) VALUES (@id, @Name, @Email, 0, @now, @now, CONVERT(uniqueidentifier, @id));
        INSERT dbo.AuthRoleAssignments(UserId, Role) VALUES (@id, ''Administrator'');
        INSERT dbo.AuthInvitations(Id, UserId, CreatedAt, ExpiresAt) VALUES (NEWID(), @id, @now, DATEADD(day, 7, @now));
        INSERT dbo.AuthAuditEvents(Id, TargetUserId, Action) VALUES (NEWID(), @id, ''bootstrap'');
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK;
        THROW;
    END CATCH
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthThrottle @Bucket varchar(80), @Maximum int
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @attempts int, @now datetime2(3) = SYSUTCDATETIME();
    SELECT @attempts = Attempts FROM dbo.AuthThrottleBuckets WITH (UPDLOCK, HOLDLOCK) WHERE Bucket = @Bucket;
    IF @attempts IS NULL
        INSERT dbo.AuthThrottleBuckets(Bucket, WindowStart, Attempts) VALUES (@Bucket, @now, 1);
    ELSE
        UPDATE dbo.AuthThrottleBuckets SET Attempts = CASE WHEN WindowStart <= DATEADD(minute, -1, @now) THEN 1 WHEN Attempts >= @Maximum THEN @Maximum + 1 ELSE Attempts + 1 END,
            WindowStart = CASE WHEN WindowStart <= DATEADD(minute, -1, @now) THEN @now ELSE WindowStart END WHERE Bucket = @Bucket;
    SELECT CAST(CASE WHEN Attempts <= @Maximum THEN 1 ELSE 0 END AS bit) AS Allowed FROM dbo.AuthThrottleBuckets WHERE Bucket = @Bucket;
    COMMIT;
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthBeginSession @UserId nvarchar(36)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    BEGIN TRANSACTION;
    DECLARE @now datetime2(3) = SYSUTCDATETIME();
    IF NOT EXISTS (SELECT 1 FROM dbo.AuthUsers u WITH (UPDLOCK, HOLDLOCK) JOIN dbo.AuthInvitations i ON i.UserId = u.id
        WHERE u.id = @UserId AND u.disabled = 0 AND (i.AcceptedAt IS NOT NULL OR i.ExpiresAt > @now))
    BEGIN ROLLBACK; THROW 53007, ''Sign-in is unavailable.'', 1; END;
    UPDATE dbo.AuthInvitations SET AcceptedAt = COALESCE(AcceptedAt, @now) WHERE UserId = @UserId;
    COMMIT;
END';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthRecordSessionEvent @UserId nvarchar(36), @Action varchar(30)
AS
BEGIN
    SET NOCOUNT ON;
    IF @Action NOT IN (''sign_in'', ''sign_out'') THROW 53003, ''Invalid session event.'', 1;
    INSERT dbo.AuthAuditEvents(Id, ActingUserId, TargetUserId, Action) VALUES (NEWID(), @UserId, @UserId, @Action);
END';
