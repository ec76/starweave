CREATE TABLE dbo.EditorialActors (
    Id uniqueidentifier NOT NULL CONSTRAINT DF_EditorialActors_Id DEFAULT NEWSEQUENTIALID(),
    Issuer nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Subject nvarchar(200) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DisplayName nvarchar(200) NOT NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_EditorialActors_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_EditorialActors_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_EditorialActors PRIMARY KEY (Id),
    CONSTRAINT UQ_EditorialActors_Identity UNIQUE (Issuer, Subject),
    CONSTRAINT CK_EditorialActors_Text CHECK (LEN(LTRIM(RTRIM(Issuer))) > 0 AND LEN(LTRIM(RTRIM(Subject))) > 0 AND LEN(LTRIM(RTRIM(DisplayName))) > 0),
    CONSTRAINT CK_EditorialActors_Timestamps CHECK (UpdatedAt >= CreatedAt)
);

CREATE TABLE dbo.Authors (
    Id uniqueidentifier NOT NULL CONSTRAINT DF_Authors_Id DEFAULT NEWSEQUENTIALID(),
    Slug varchar(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DisplayName nvarchar(200) NOT NULL,
    Biography nvarchar(max) NULL,
    PhotoUrl nvarchar(2048) NULL,
    PhotoAlt nvarchar(500) NULL,
    Affiliation nvarchar(300) NULL,
    ActorId uniqueidentifier NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Authors_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_Authors_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_Authors PRIMARY KEY (Id),
    CONSTRAINT UQ_Authors_Slug UNIQUE (Slug),
    CONSTRAINT FK_Authors_Actor FOREIGN KEY (ActorId) REFERENCES dbo.EditorialActors(Id),
    CONSTRAINT CK_Authors_Slug CHECK (DATALENGTH(Slug) BETWEEN 1 AND 160 AND Slug NOT LIKE '%[^a-z0-9-]%' AND LEFT(Slug, 1) <> '-' AND RIGHT(Slug, 1) <> '-' AND Slug NOT LIKE '%--%'),
    CONSTRAINT CK_Authors_Name CHECK (LEN(LTRIM(RTRIM(DisplayName))) > 0),
    CONSTRAINT CK_Authors_Photo CHECK (PhotoUrl IS NOT NULL OR PhotoAlt IS NULL),
    CONSTRAINT CK_Authors_Timestamps CHECK (UpdatedAt >= CreatedAt)
);
CREATE INDEX IX_Authors_Actor ON dbo.Authors(ActorId) WHERE ActorId IS NOT NULL;

CREATE TABLE dbo.Articles (
    Id uniqueidentifier NOT NULL CONSTRAINT DF_Articles_Id DEFAULT NEWSEQUENTIALID(),
    PrimaryAuthorId uniqueidentifier NOT NULL,
    Language varchar(2) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Slug varchar(160) COLLATE Latin1_General_100_BIN2 NOT NULL,
    PublishedRevisionId uniqueidentifier NULL,
    FirstPublishedAt datetime2(3) NULL,
    PublishedAt datetime2(3) NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_Articles_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_Articles_Updated DEFAULT SYSUTCDATETIME(),
    ArchivedAt datetime2(3) NULL,
    CONSTRAINT PK_Articles PRIMARY KEY (Id),
    CONSTRAINT UQ_Articles_Slug UNIQUE (Slug),
    CONSTRAINT FK_Articles_Author FOREIGN KEY (PrimaryAuthorId) REFERENCES dbo.Authors(Id),
    CONSTRAINT CK_Articles_Language CHECK (Language IN ('en', 'es')),
    CONSTRAINT CK_Articles_Slug CHECK (DATALENGTH(Slug) BETWEEN 1 AND 160 AND Slug NOT LIKE '%[^a-z0-9-]%' AND LEFT(Slug, 1) <> '-' AND RIGHT(Slug, 1) <> '-' AND Slug NOT LIKE '%--%'),
    CONSTRAINT CK_Articles_Publication CHECK (
        (PublishedRevisionId IS NULL AND PublishedAt IS NULL) OR
        (PublishedRevisionId IS NOT NULL AND PublishedAt IS NOT NULL AND FirstPublishedAt IS NOT NULL AND FirstPublishedAt <= PublishedAt)
    ),
    CONSTRAINT CK_Articles_Timestamps CHECK (UpdatedAt >= CreatedAt AND (ArchivedAt IS NULL OR ArchivedAt >= CreatedAt))
);
CREATE INDEX IX_Articles_Author ON dbo.Articles(PrimaryAuthorId);
CREATE INDEX IX_Articles_PublicListing ON dbo.Articles(Language, PublishedAt DESC, Id)
    INCLUDE (Slug, PrimaryAuthorId, PublishedRevisionId)
    WHERE ArchivedAt IS NULL AND PublishedRevisionId IS NOT NULL;

CREATE TABLE dbo.ArticleRevisions (
    Id uniqueidentifier NOT NULL CONSTRAINT DF_ArticleRevisions_Id DEFAULT NEWSEQUENTIALID(),
    ArticleId uniqueidentifier NOT NULL,
    RevisionNumber int NOT NULL,
    Title nvarchar(300) NOT NULL,
    Summary nvarchar(2000) NOT NULL,
    BodyJson nvarchar(max) NOT NULL,
    SeoDescription nvarchar(500) NULL,
    SharingImageUrl nvarchar(2048) NULL,
    SharingImageAlt nvarchar(500) NULL,
    Status varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL CONSTRAINT DF_ArticleRevisions_Status DEFAULT 'draft',
    CreatedByActorId uniqueidentifier NOT NULL,
    SubmittedByActorId uniqueidentifier NULL,
    CreatedAt datetime2(3) NOT NULL CONSTRAINT DF_ArticleRevisions_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAt datetime2(3) NOT NULL CONSTRAINT DF_ArticleRevisions_Updated DEFAULT SYSUTCDATETIME(),
    SubmittedAt datetime2(3) NULL,
    RowVersion rowversion NOT NULL,
    CONSTRAINT PK_ArticleRevisions PRIMARY KEY (Id),
    CONSTRAINT UQ_ArticleRevisions_Number UNIQUE (ArticleId, RevisionNumber),
    CONSTRAINT UQ_ArticleRevisions_ArticleId_Id UNIQUE (ArticleId, Id),
    CONSTRAINT FK_ArticleRevisions_Article FOREIGN KEY (ArticleId) REFERENCES dbo.Articles(Id),
    CONSTRAINT FK_ArticleRevisions_Creator FOREIGN KEY (CreatedByActorId) REFERENCES dbo.EditorialActors(Id),
    CONSTRAINT FK_ArticleRevisions_Submitter FOREIGN KEY (SubmittedByActorId) REFERENCES dbo.EditorialActors(Id),
    CONSTRAINT CK_ArticleRevisions_Number CHECK (RevisionNumber > 0),
    CONSTRAINT CK_ArticleRevisions_Text CHECK (LEN(LTRIM(RTRIM(Title))) > 0 AND LEN(LTRIM(RTRIM(Summary))) > 0),
    CONSTRAINT CK_ArticleRevisions_Json CHECK (ISJSON(BodyJson) = 1),
    CONSTRAINT CK_ArticleRevisions_Image CHECK (SharingImageUrl IS NOT NULL OR SharingImageAlt IS NULL),
    CONSTRAINT CK_ArticleRevisions_Status CHECK (Status IN ('draft', 'submitted', 'changes_requested', 'approved')),
    CONSTRAINT CK_ArticleRevisions_Submission CHECK (
        (SubmittedByActorId IS NULL AND SubmittedAt IS NULL AND Status = 'draft') OR
        (SubmittedByActorId IS NOT NULL AND SubmittedAt IS NOT NULL)
    ),
    CONSTRAINT CK_ArticleRevisions_Timestamps CHECK (UpdatedAt >= CreatedAt AND (SubmittedAt IS NULL OR SubmittedAt >= CreatedAt))
);
CREATE INDEX IX_ArticleRevisions_Creator ON dbo.ArticleRevisions(CreatedByActorId);
CREATE INDEX IX_ArticleRevisions_Submitter ON dbo.ArticleRevisions(SubmittedByActorId) WHERE SubmittedByActorId IS NOT NULL;
ALTER TABLE dbo.Articles ADD CONSTRAINT FK_Articles_PublishedRevision
    FOREIGN KEY (Id, PublishedRevisionId) REFERENCES dbo.ArticleRevisions(ArticleId, Id);
CREATE INDEX IX_Articles_PublishedRevision ON dbo.Articles(PublishedRevisionId) WHERE PublishedRevisionId IS NOT NULL;

CREATE TABLE dbo.ReviewDecisions (
    Id uniqueidentifier NOT NULL CONSTRAINT DF_ReviewDecisions_Id DEFAULT NEWSEQUENTIALID(),
    RevisionId uniqueidentifier NOT NULL,
    ReviewerActorId uniqueidentifier NOT NULL,
    Decision varchar(20) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ReviewComment nvarchar(4000) NULL,
    DecidedAt datetime2(3) NOT NULL CONSTRAINT DF_ReviewDecisions_Decided DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_ReviewDecisions PRIMARY KEY (Id),
    CONSTRAINT FK_ReviewDecisions_Revision FOREIGN KEY (RevisionId) REFERENCES dbo.ArticleRevisions(Id),
    CONSTRAINT FK_ReviewDecisions_Reviewer FOREIGN KEY (ReviewerActorId) REFERENCES dbo.EditorialActors(Id),
    CONSTRAINT CK_ReviewDecisions_Decision CHECK (Decision IN ('approved', 'changes_requested'))
);
CREATE INDEX IX_ReviewDecisions_Revision ON dbo.ReviewDecisions(RevisionId, DecidedAt, Id);
CREATE INDEX IX_ReviewDecisions_Reviewer ON dbo.ReviewDecisions(ReviewerActorId);
