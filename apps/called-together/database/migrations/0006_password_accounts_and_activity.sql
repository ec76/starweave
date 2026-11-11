-- Cutover: never edit 0001-0005. Existing user/actor/article IDs are retained.
ALTER TABLE dbo.AuthUsers ADD activatedAt datetime2(3) NULL;
ALTER TABLE dbo.AuthAccounts DROP CONSTRAINT CK_AuthAccounts_NoCredentials;
ALTER TABLE dbo.AuthAccounts ADD CONSTRAINT CK_AuthAccounts_Credentials CHECK (
    providerId = N'credential' AND accountId COLLATE Latin1_General_100_BIN2 = userId AND password IS NOT NULL
    AND DATALENGTH(password) BETWEEN 128 AND 2048
    AND accessToken IS NULL AND refreshToken IS NULL AND idToken IS NULL);
CREATE UNIQUE INDEX UX_AuthAccounts_CredentialUser ON dbo.AuthAccounts(userId, providerId);
CREATE TABLE dbo.AuthSetupVerifications (
    id nvarchar(43) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthSetupVerifications PRIMARY KEY,
    identifier nvarchar(255) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT UQ_AuthSetupVerifications_Identifier UNIQUE,
    value nvarchar(1000) COLLATE Latin1_General_100_BIN2 NOT NULL,
    expiresAt datetime2(3) NOT NULL, createdAt datetime2(3) NOT NULL, updatedAt datetime2(3) NOT NULL,
    CONSTRAINT CK_AuthSetupVerifications_Dates CHECK (expiresAt > createdAt)
);
DELETE dbo.AuthSessions;
DELETE dbo.AuthVerifications;
CREATE TABLE dbo.AuthNotifications (
 UserId nvarchar(36) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT PK_AuthNotifications PRIMARY KEY,
 CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_AuthNotifications_Time DEFAULT SYSUTCDATETIME(),
 DeliveredAt datetime2(3) NULL,
 CONSTRAINT FK_AuthNotifications_User FOREIGN KEY(UserId) REFERENCES dbo.AuthUsers(id)
);

INSERT dbo.AuthNotifications(UserId) SELECT id FROM dbo.AuthUsers;

CREATE TABLE dbo.ActivityEvents (
    Id uniqueidentifier NOT NULL CONSTRAINT PK_ActivityEvents PRIMARY KEY,
    OccurredAt datetime2(3) NOT NULL CONSTRAINT DF_ActivityEvents_Time DEFAULT SYSUTCDATETIME(),
    EventType varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Outcome varchar(10) NOT NULL CONSTRAINT CK_ActivityEvents_Outcome CHECK (Outcome IN ('success','failure')),
    ActorKind varchar(10) NOT NULL CONSTRAINT CK_ActivityEvents_Actor CHECK (ActorKind IN ('account','system','operator')),
    ActingAccountId nvarchar(36) COLLATE Latin1_General_100_BIN2 NULL,
    TargetAccountId nvarchar(36) COLLATE Latin1_General_100_BIN2 NULL,
    ArticleId uniqueidentifier NULL, RevisionId uniqueidentifier NULL,
    Role varchar(20) NULL CONSTRAINT CK_ActivityEvents_Role CHECK (Role IS NULL OR Role IN ('Writer','Approver','Administrator')),
    Reason varchar(30) NOT NULL CONSTRAINT CK_ActivityEvents_Reason CHECK (Reason IN ('completed','cutover','legacy')),
    CorrelationId uniqueidentifier NOT NULL,
    CONSTRAINT CK_ActivityEvents_Type CHECK (EventType IN (
      'account_created','account_bootstrapped','setup_completed','role_granted','role_revoked',
      'account_enabled','account_disabled','login','logout','sessions_revoked','password_reset','auth_cutover','invitation_renewed',
      'article_created','article_edited','article_archived','article_submitted','changes_requested',
      'article_approved','article_published','article_unpublished')),
    CONSTRAINT CK_ActivityEvents_ActorId CHECK ((ActorKind='account' AND ActingAccountId IS NOT NULL) OR (ActorKind<>'account' AND ActingAccountId IS NULL)),
    CONSTRAINT FK_ActivityEvents_Actor FOREIGN KEY (ActingAccountId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT FK_ActivityEvents_Target FOREIGN KEY (TargetAccountId) REFERENCES dbo.AuthUsers(id),
    CONSTRAINT FK_ActivityEvents_Article FOREIGN KEY (ArticleId) REFERENCES dbo.Articles(Id),
    CONSTRAINT FK_ActivityEvents_Revision FOREIGN KEY (ArticleId,RevisionId) REFERENCES dbo.ArticleRevisions(ArticleId,Id),
    CONSTRAINT CK_ActivityEvents_Target CHECK (
      (EventType IN ('article_created','article_edited','article_archived','article_submitted','changes_requested','article_approved','article_published','article_unpublished') AND ArticleId IS NOT NULL AND RevisionId IS NOT NULL)
      OR (EventType NOT IN ('article_created','article_edited','article_archived','article_submitted','changes_requested','article_approved','article_published','article_unpublished') AND (EventType='auth_cutover' OR TargetAccountId IS NOT NULL)))
);
CREATE INDEX IX_ActivityEvents_Time ON dbo.ActivityEvents(OccurredAt DESC,Id);
CREATE INDEX IX_ActivityEvents_Target ON dbo.ActivityEvents(TargetAccountId,OccurredAt DESC);
INSERT dbo.ActivityEvents(Id,OccurredAt,EventType,Outcome,ActorKind,ActingAccountId,TargetAccountId,Role,Reason,CorrelationId)
SELECT Id,CreatedAt,CASE Action WHEN 'bootstrap' THEN 'account_bootstrapped' WHEN 'invite' THEN 'account_created'
  WHEN 'grant_role' THEN 'role_granted' WHEN 'revoke_role' THEN 'role_revoked' WHEN 'disable' THEN 'account_disabled'
  WHEN 'revoke_sessions' THEN 'sessions_revoked' WHEN 'sign_in' THEN 'login' ELSE 'logout' END,
  'success',CASE WHEN ActingUserId IS NULL THEN 'operator' ELSE 'account' END,ActingUserId,TargetUserId,Role,'legacy',Id
FROM dbo.AuthAuditEvents;
INSERT dbo.ActivityEvents(Id,EventType,Outcome,ActorKind,Reason,CorrelationId)
VALUES(NEWID(),'auth_cutover','success','system','cutover',NEWID());

-- Separate, fixed-size security aggregates, not mutable business audit history.
-- At most 168 hours x 4 categories; no email, network identifier or credential.
CREATE TABLE dbo.AuthSecurityBuckets (
    Slot smallint NOT NULL CHECK (Slot BETWEEN 0 AND 167),
    EventType varchar(30) NOT NULL CHECK (EventType IN ('login_failed','code_requested','code_rejected','reset_failed')),
    Id uniqueidentifier NOT NULL, PeriodStart datetime2(3) NOT NULL,
    Attempts int NOT NULL CHECK (Attempts BETWEEN 1 AND 100000),
    CONSTRAINT PK_AuthSecurityBuckets PRIMARY KEY(Slot,EventType)
);

-- Defense in depth: runtime audit history is insert-only through owned procedures.
EXEC sys.sp_executesql N'CREATE TRIGGER dbo.ActivityEvents_Immutable ON dbo.ActivityEvents INSTEAD OF UPDATE, DELETE AS BEGIN THROW 53220, ''Activity history is immutable.'', 1; END';
EXEC sys.sp_executesql N'CREATE TRIGGER dbo.AuthAuditEvents_Immutable ON dbo.AuthAuditEvents INSTEAD OF UPDATE, DELETE AS BEGIN THROW 53220, ''Legacy audit history is immutable.'', 1; END';
