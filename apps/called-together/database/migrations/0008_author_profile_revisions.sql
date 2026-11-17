-- Authors hold stable identity/ownership. Public content is selected separately.
ALTER TABLE dbo.Authors ADD LatestProfileRevisionId uniqueidentifier NULL, ApprovedProfileRevisionId uniqueidentifier NULL;
CREATE TABLE dbo.AuthorProfileRevisions (
 Id uniqueidentifier NOT NULL CONSTRAINT PK_AuthorProfileRevisions PRIMARY KEY,
 AuthorId uniqueidentifier NOT NULL,
 RevisionNumber int NOT NULL CHECK (RevisionNumber > 0),
 DisplayName nvarchar(200) NOT NULL CHECK (LEN(LTRIM(RTRIM(DisplayName))) > 0),
 Biography nvarchar(max) NULL,
 PhotoUrl nvarchar(2048) NULL, PhotoAlt nvarchar(500) NULL, Affiliation nvarchar(300) NULL,
 SavedByActorId uniqueidentifier NULL,
 SavedByName nvarchar(200) NOT NULL,
 SavedAt datetime2(3) NOT NULL CONSTRAINT DF_AuthorProfileRevisions_Time DEFAULT SYSUTCDATETIME(),
 Source varchar(20) NOT NULL CHECK (Source IN ('save','legacy_publication','legacy_private')),
 CONSTRAINT CK_AuthorProfileRevisions_Actor CHECK (SavedByActorId IS NOT NULL OR Source IN ('legacy_publication','legacy_private')),
 CONSTRAINT CK_AuthorProfileRevisions_Photo CHECK (PhotoUrl IS NOT NULL OR PhotoAlt IS NULL),
 CONSTRAINT UQ_AuthorProfileRevisions_Number UNIQUE(AuthorId,RevisionNumber),
 CONSTRAINT UQ_AuthorProfileRevisions_Author UNIQUE(AuthorId,Id),
 CONSTRAINT FK_AuthorProfileRevisions_Author FOREIGN KEY(AuthorId) REFERENCES dbo.Authors(Id),
 CONSTRAINT FK_AuthorProfileRevisions_Actor FOREIGN KEY(SavedByActorId) REFERENCES dbo.EditorialActors(Id)
);
-- Preserve only attribution already exposed by an approved publication. Do not
-- promote other legacy authors to public profiles or invent a historical saver.
INSERT dbo.AuthorProfileRevisions(Id,AuthorId,RevisionNumber,DisplayName,Biography,PhotoUrl,PhotoAlt,Affiliation,SavedByName,SavedAt,Source)
 SELECT NEWID(),p.Id,1,p.DisplayName,p.Biography,p.PhotoUrl,p.PhotoAlt,p.Affiliation,
 N'Legacy profile (original saver unknown)',p.UpdatedAt,
 CASE WHEN EXISTS (
 SELECT 1 FROM dbo.Articles a JOIN dbo.ArticleRevisions r ON r.ArticleId=a.Id AND r.Id=a.PublishedRevisionId
 WHERE a.PrimaryAuthorId=p.Id AND a.ArchivedAt IS NULL AND a.PublishedAt IS NOT NULL AND r.Status='approved')
 THEN 'legacy_publication' ELSE 'legacy_private' END FROM dbo.Authors p;
EXEC sys.sp_executesql N'UPDATE p SET LatestProfileRevisionId=r.Id, ApprovedProfileRevisionId=CASE WHEN r.Source=''legacy_publication'' THEN r.Id END
 FROM dbo.Authors p JOIN dbo.AuthorProfileRevisions r ON r.AuthorId=p.Id';
ALTER TABLE dbo.Authors ADD CONSTRAINT FK_Authors_LatestProfile FOREIGN KEY(Id,LatestProfileRevisionId) REFERENCES dbo.AuthorProfileRevisions(AuthorId,Id);
ALTER TABLE dbo.Authors ADD CONSTRAINT FK_Authors_ApprovedProfile FOREIGN KEY(Id,ApprovedProfileRevisionId) REFERENCES dbo.AuthorProfileRevisions(AuthorId,Id);
EXEC sys.sp_executesql N'CREATE TRIGGER dbo.AuthorProfileRevisions_Immutable ON dbo.AuthorProfileRevisions INSTEAD OF UPDATE,DELETE AS BEGIN THROW 53320,''Profile history is immutable.'',1; END';

EXEC sys.sp_executesql N'ALTER VIEW dbo.PublicArticles AS
SELECT a.Id AS ArticleId,a.Slug,a.Language,a.FirstPublishedAt,a.PublishedAt,
 r.Id AS RevisionId,r.RevisionNumber,r.Title,r.Summary,r.BodyJson,r.SeoDescription,r.SharingImageUrl,r.SharingImageAlt,
 p.Id AS AuthorId,p.Slug AS AuthorSlug,v.DisplayName AS AuthorDisplayName,v.Biography AS AuthorBiography,
 v.PhotoUrl AS AuthorPhotoUrl,v.PhotoAlt AS AuthorPhotoAlt,v.Affiliation AS AuthorAffiliation
FROM dbo.Articles a JOIN dbo.ArticleRevisions r ON r.ArticleId=a.Id AND r.Id=a.PublishedRevisionId
 JOIN dbo.Authors p ON p.Id=a.PrimaryAuthorId
 JOIN dbo.AuthorProfileRevisions v ON v.AuthorId=p.Id AND v.Id=p.ApprovedProfileRevisionId
WHERE a.ArchivedAt IS NULL AND r.Status=''approved'' AND a.PublishedAt IS NOT NULL';

EXEC sys.sp_executesql N'CREATE PROCEDURE dbo.AuthorProfileOperation
 @SessionId nvarchar(36), @Action varchar(10), @ProfileId uniqueidentifier=NULL, @ExpectedRevisionId uniqueidentifier=NULL,
 @DisplayName nvarchar(200)=NULL,@Biography nvarchar(max)=NULL,@PhotoUrl nvarchar(2048)=NULL,@PhotoAlt nvarchar(500)=NULL,@Affiliation nvarchar(300)=NULL
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 BEGIN TRANSACTION;
 BEGIN TRY
  DECLARE @lock int,@actor uniqueidentifier,@user nvarchar(36),@admin bit=0,@latest uniqueidentifier,@revision uniqueidentifier=NEWID(),@number int,@name nvarchar(200);
  -- Same lock as account role changes, disablement and session revocation.
  EXEC @lock=sys.sp_getapplock @Resource=N''CalledTogether:accounts:administration'',@LockMode=''Exclusive'',@LockOwner=''Transaction'',@LockTimeout=5000;
  IF @lock<0 THROW 53309,''Profiles are busy. Try again.'',1;
  SELECT @actor=u.actorId,@user=u.id,@name=u.name FROM dbo.AuthSessions s JOIN dbo.AuthUsers u ON u.id=s.userId
   WHERE s.id=@SessionId AND s.expiresAt>SYSUTCDATETIME() AND u.disabled=0 AND u.activatedAt IS NOT NULL AND u.emailVerified=1
    AND EXISTS(SELECT 1 FROM dbo.AuthInvitations i WHERE i.UserId=u.id AND i.AcceptedAt IS NOT NULL)
    AND EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments r WHERE r.UserId=u.id AND r.Role=''Writer'');
  IF @actor IS NULL THROW 53303,''Writer access required.'',1;
  IF EXISTS(SELECT 1 FROM dbo.AuthRoleAssignments WHERE UserId=@user AND Role=''Administrator'') SET @admin=1;
  IF @Action IS NULL OR @Action NOT IN (''read'',''save'',''list'') THROW 53300,''Invalid profile operation.'',1;
  IF @Action=''list''
  BEGIN
   SELECT p.Id AS id,COALESCE(v.DisplayName,p.DisplayName) AS displayName FROM dbo.Authors p
    LEFT JOIN dbo.AuthorProfileRevisions v ON v.Id=p.LatestProfileRevisionId
    WHERE p.ActorId=@actor OR @admin=1 ORDER BY displayName,p.Id;
   COMMIT; RETURN;
  END;
  IF @ProfileId IS NULL
   SELECT TOP(1) @ProfileId=Id FROM dbo.Authors WHERE ActorId=@actor ORDER BY CreatedAt,Id;
  IF @ProfileId IS NOT NULL
  BEGIN
   IF NOT EXISTS(SELECT 1 FROM dbo.Authors WHERE Id=@ProfileId AND (ActorId=@actor OR @admin=1)) THROW 53303,''Profile access denied.'',1;
   SELECT @latest=LatestProfileRevisionId FROM dbo.Authors WHERE Id=@ProfileId;
  END;
  IF @Action=''save''
  BEGIN
   IF (@latest<>@ExpectedRevisionId OR (@latest IS NULL AND @ExpectedRevisionId IS NOT NULL) OR (@latest IS NOT NULL AND @ExpectedRevisionId IS NULL))
    THROW 53309,''Profile changed. Reload before saving.'',1;
   IF @DisplayName IS NULL OR LEN(LTRIM(RTRIM(@DisplayName)))=0 OR DATALENGTH(@Biography)>8000
    OR (@PhotoUrl IS NULL AND @PhotoAlt IS NOT NULL) OR (@PhotoUrl IS NOT NULL AND (@PhotoUrl NOT LIKE N''https://%'' OR @PhotoAlt IS NULL))
    THROW 53300,''Invalid profile content.'',1;
   IF @ProfileId IS NULL
   BEGIN
    SET @ProfileId=NEWID();
    INSERT dbo.Authors(Id,Slug,DisplayName,ActorId) VALUES(@ProfileId,LOWER(CONVERT(varchar(36),@ProfileId)),@DisplayName,@actor);
   END;
   SELECT @number=ISNULL(MAX(RevisionNumber),0)+1 FROM dbo.AuthorProfileRevisions WHERE AuthorId=@ProfileId;
   INSERT dbo.AuthorProfileRevisions(Id,AuthorId,RevisionNumber,DisplayName,Biography,PhotoUrl,PhotoAlt,Affiliation,SavedByActorId,SavedByName,Source)
    VALUES(@revision,@ProfileId,@number,@DisplayName,@Biography,@PhotoUrl,@PhotoAlt,@Affiliation,@actor,@name,''save'');
   UPDATE dbo.Authors SET LatestProfileRevisionId=@revision,UpdatedAt=SYSUTCDATETIME() WHERE Id=@ProfileId;
   SELECT @revision AS id;
  END
  ELSE
  BEGIN
   SELECT @ProfileId AS id,@latest AS latestRevisionId;
   SELECT Id AS id,RevisionNumber AS number,DisplayName AS displayName,COALESCE(Biography,N'''') AS biography,
    COALESCE(PhotoUrl,N'''') AS photoUrl,COALESCE(PhotoAlt,N'''') AS photoAlt,COALESCE(Affiliation,N'''') AS affiliation,
    SavedByActorId AS actorId,SavedByName AS savedBy,SavedAt AS savedAt
    FROM dbo.AuthorProfileRevisions WHERE AuthorId=@ProfileId ORDER BY RevisionNumber DESC;
  END;
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH
END';
