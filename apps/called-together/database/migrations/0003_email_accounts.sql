-- Library-owned core columns are mapped explicitly in server/admin/auth.ts.
CREATE TABLE dbo.AuthUsers (
    id nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthUsers PRIMARY KEY,
    name nvarchar(200) NOT NULL,
    email nvarchar(254) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_AuthUsers_Email UNIQUE,
    emailVerified bit NOT NULL CONSTRAINT DF_AuthUsers_Verified DEFAULT 0,
    image nvarchar(2048) NULL,
    createdAt datetime2(3) NOT NULL,
    updatedAt datetime2(3) NOT NULL,
    disabled bit NOT NULL CONSTRAINT DF_AuthUsers_Disabled DEFAULT 0,
    actorId uniqueidentifier NOT NULL CONSTRAINT UQ_AuthUsers_Actor UNIQUE,
    CONSTRAINT FK_AuthUsers_Actor FOREIGN KEY (actorId) REFERENCES dbo.EditorialActors(Id),
    CONSTRAINT CK_AuthUsers_Id CHECK (TRY_CONVERT(uniqueidentifier, id) IS NOT NULL AND LEN(id) = 36),
    CONSTRAINT CK_AuthUsers_Email CHECK (email = LOWER(email) AND email NOT LIKE '% %' AND email LIKE '%_@_%._%'),
    CONSTRAINT CK_AuthUsers_Name CHECK (LEN(LTRIM(RTRIM(name))) > 0),
    CONSTRAINT CK_AuthUsers_Dates CHECK (updatedAt >= createdAt)
);
CREATE TABLE dbo.AuthRoleAssignments (
    UserId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Role varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_AuthRoles_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_AuthRoleAssignments PRIMARY KEY (UserId, Role),
    CONSTRAINT FK_AuthRoles_User FOREIGN KEY (UserId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT CK_AuthRoles_Role CHECK (Role IN ('Writer', 'Approver', 'Administrator'))
);
CREATE INDEX IX_AuthRoles_Role ON dbo.AuthRoleAssignments(Role, UserId);
CREATE TABLE dbo.AuthInvitations (
    Id uniqueidentifier NOT NULL CONSTRAINT PK_AuthInvitations PRIMARY KEY,
    UserId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_AuthInvitations_User UNIQUE,
    InvitedBy nvarchar(36) COLLATE Latin1_General_100_BIN2 NULL,
    CreatedAt datetime2(3) NOT NULL,
    ExpiresAt datetime2(3) NOT NULL,
    AcceptedAt datetime2(3) NULL,
    CONSTRAINT FK_AuthInvitations_User FOREIGN KEY (UserId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT FK_AuthInvitations_Inviter FOREIGN KEY (InvitedBy) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT CK_AuthInvitations_Dates CHECK (ExpiresAt > CreatedAt AND (AcceptedAt IS NULL OR AcceptedAt >= CreatedAt))
);
CREATE INDEX IX_AuthInvitations_Inviter ON dbo.AuthInvitations(InvitedBy);
CREATE TABLE dbo.AuthSessions (
    id nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthSessions PRIMARY KEY,
    userId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL,
    token nvarchar(255) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_AuthSessions_Token UNIQUE,
    expiresAt datetime2(3) NOT NULL,
    createdAt datetime2(3) NOT NULL,
    updatedAt datetime2(3) NOT NULL,
    ipAddress nvarchar(64) NULL,
    userAgent nvarchar(512) NULL,
    CONSTRAINT FK_AuthSessions_User FOREIGN KEY (userId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT CK_AuthSessions_Dates CHECK (expiresAt > createdAt AND updatedAt >= createdAt)
);
CREATE INDEX IX_AuthSessions_User ON dbo.AuthSessions(userId, expiresAt);
CREATE TABLE dbo.AuthAccounts (
    id nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthAccounts PRIMARY KEY,
    userId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL,
    accountId nvarchar(255) NOT NULL,
    providerId nvarchar(255) NOT NULL,
    accessToken nvarchar(max) NULL,
    refreshToken nvarchar(max) NULL,
    idToken nvarchar(max) NULL,
    accessTokenExpiresAt datetime2(3) NULL,
    refreshTokenExpiresAt datetime2(3) NULL,
    scope nvarchar(1000) NULL,
    password nvarchar(max) NULL,
    createdAt datetime2(3) NOT NULL,
    updatedAt datetime2(3) NOT NULL,
    CONSTRAINT FK_AuthAccounts_User FOREIGN KEY (userId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT UQ_AuthAccounts_Provider UNIQUE (providerId, accountId),
    -- This foundation enables no password or external identity-provider accounts.
    CONSTRAINT CK_AuthAccounts_NoCredentials CHECK (password IS NULL AND accessToken IS NULL AND refreshToken IS NULL AND idToken IS NULL)
);
CREATE INDEX IX_AuthAccounts_User ON dbo.AuthAccounts(userId);
CREATE TABLE dbo.AuthVerifications (
    id nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthVerifications PRIMARY KEY,
    identifier nvarchar(255) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_AuthVerifications_Identifier UNIQUE,
    value nvarchar(1000) COLLATE Latin1_General_100_BIN2 NOT NULL,
    expiresAt datetime2(3) NOT NULL,
    createdAt datetime2(3) NOT NULL,
    updatedAt datetime2(3) NOT NULL,
    CONSTRAINT CK_AuthVerifications_Dates CHECK (expiresAt > createdAt)
);
CREATE TABLE dbo.AuthThrottleBuckets (
    Bucket varchar(80) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthThrottle PRIMARY KEY,
    WindowStart datetime2(3) NOT NULL,
    Attempts int NOT NULL,
    CONSTRAINT CK_AuthThrottle_Attempts CHECK (Attempts >= 1)
);
CREATE TABLE dbo.AuthAuditEvents (
    Id uniqueidentifier NOT NULL CONSTRAINT PK_AuthAuditEvents PRIMARY KEY,
    ActingUserId nvarchar(36) COLLATE Latin1_General_100_BIN2 NULL,
    TargetUserId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Action varchar(30) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Role varchar(20) COLLATE Latin1_General_100_BIN2 NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_AuthAudit_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_AuthAudit_Actor FOREIGN KEY (ActingUserId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT FK_AuthAudit_Target FOREIGN KEY (TargetUserId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT CK_AuthAudit_Action CHECK (Action IN ('bootstrap', 'invite', 'grant_role', 'revoke_role', 'disable', 'revoke_sessions', 'sign_in', 'sign_out')),
    CONSTRAINT CK_AuthAudit_Role CHECK (Role IS NULL OR Role IN ('Writer', 'Approver', 'Administrator'))
);
CREATE INDEX IX_AuthAudit_Actor ON dbo.AuthAuditEvents(ActingUserId, CreatedAt);
CREATE INDEX IX_AuthAudit_Target ON dbo.AuthAuditEvents(TargetUserId, CreatedAt);
