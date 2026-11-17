-- OPT-IN ONLY. Run on a dedicated, empty, migrated disposable database.
-- This fixture COMMITS fictional accounts/content so rejected operations can
-- roll back independently. Retain the database for inspection; never run live.
DECLARE @expected sysname=CONVERT(sysname,SESSION_CONTEXT(N'CalledTogetherVerificationDatabase'));
IF @expected IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 OR RIGHT(DB_NAME(),15)<>N'_migration_test' OR DB_NAME()=N'sqldb-called-together-dev'
 THROW 53400,'Select the exact dedicated disposable database.',1;
IF @@TRANCOUNT<>0 OR (@@OPTIONS & 2)=2 THROW 53400,'Use a clean autocommit session.',1;
IF EXISTS(SELECT 1 FROM dbo.AuthUsers) OR EXISTS(SELECT 1 FROM dbo.Authors) OR EXISTS(SELECT 1 FROM dbo.EditorialActors)
 THROW 53400,'Verification requires an empty account/editorial store.',1;
SET NOCOUNT ON;
DECLARE @now datetime2(3)=SYSUTCDATETIME(),@mask int=0;
DECLARE @people TABLE(mask int,id nvarchar(36),sessionId nvarchar(36));
BEGIN TRANSACTION;
WHILE @mask<8
BEGIN
 DECLARE @id nvarchar(36)=LOWER(CONVERT(nvarchar(36),NEWID())),@session nvarchar(36)=LOWER(CONVERT(nvarchar(36),NEWID()));
 INSERT @people VALUES(@mask,@id,@session);
 INSERT dbo.EditorialActors(Id,Issuer,Subject,DisplayName) VALUES(CONVERT(uniqueidentifier,@id),N'urn:called-together:users',@id,N'Fictional staff');
 INSERT dbo.AuthUsers(id,name,email,emailVerified,createdAt,updatedAt,actorId,activatedAt)
 VALUES(@id,N'Fictional staff',@id+N'@example.invalid',1,@now,@now,CONVERT(uniqueidentifier,@id),@now);
 INSERT dbo.AuthInvitations(Id,UserId,CreatedAt,ExpiresAt,AcceptedAt) VALUES(NEWID(),@id,@now,DATEADD(day,7,@now),@now);
 INSERT dbo.AuthSessions(id,userId,token,expiresAt,createdAt,updatedAt) VALUES(@session,@id,CONVERT(nvarchar(36),NEWID()),DATEADD(day,1,@now),@now,@now);
 IF (@mask & 1)=1 INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@id,'Writer');
 IF (@mask & 2)=2 INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@id,'Approver');
 IF (@mask & 4)=4 INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@id,'Administrator');
 SET @mask+=1;
END;
COMMIT;
DECLARE @owner nvarchar(36),@ownerSession nvarchar(36),@profile uniqueidentifier,@first uniqueidentifier,@second uniqueidentifier;
SELECT @owner=id,@ownerSession=sessionId FROM @people WHERE mask=1;
EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='save',@DisplayName=N'Approved pen name',@Biography=N'Approved biography';
SELECT @profile=Id,@first=LatestProfileRevisionId FROM dbo.Authors WHERE ActorId=CONVERT(uniqueidentifier,@owner);
IF (SELECT COUNT(*) FROM dbo.AuthorProfileRevisions WHERE AuthorId=@profile AND SavedByActorId=CONVERT(uniqueidentifier,@owner) AND SavedByName=N'Fictional staff' AND SavedAt>=@now)<>1
 THROW 53401,'Initial authenticated save did not retain actor/time/content.',1;
-- Simulate the separately scoped approval boundary, then publish a test article.
UPDATE dbo.Authors SET ApprovedProfileRevisionId=@first WHERE Id=@profile;
DECLARE @article uniqueidentifier=NEWID(),@articleRevision uniqueidentifier=NEWID();
INSERT dbo.Articles(Id,PrimaryAuthorId,Language,Slug) VALUES(@article,@profile,'en','fictional-profile-verification');
INSERT dbo.ArticleRevisions(Id,ArticleId,RevisionNumber,Title,Summary,BodyJson,CreatedByActorId,Status,SubmittedByActorId,SubmittedAt)
 VALUES(@articleRevision,@article,1,N'Fictional article',N'Fictional summary',N'{"version":1,"format":"called-together.rich-text","content":{}}',CONVERT(uniqueidentifier,@owner),'approved',CONVERT(uniqueidentifier,@owner),SYSUTCDATETIME());
UPDATE dbo.Articles SET PublishedRevisionId=@articleRevision,FirstPublishedAt=SYSUTCDATETIME(),PublishedAt=SYSUTCDATETIME() WHERE Id=@article;
EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@first,@DisplayName=N'PRIVATE replacement',@Biography=N'PRIVATE biography';
SELECT @second=LatestProfileRevisionId FROM dbo.Authors WHERE Id=@profile;
IF @first=@second OR (SELECT COUNT(*) FROM dbo.AuthorProfileRevisions WHERE AuthorId=@profile)<>2
 OR NOT EXISTS(SELECT 1 FROM dbo.AuthorProfileRevisions WHERE Id=@first AND DisplayName=N'Approved pen name' AND Biography=N'Approved biography')
 THROW 53402,'Save overwrote history.',1;
IF NOT EXISTS(SELECT 1 FROM dbo.PublicArticles WHERE ArticleId=@article AND AuthorDisplayName=N'Approved pen name' AND AuthorBiography=N'Approved biography')
 THROW 53403,'Pending profile leaked through anonymous attribution.',1;
BEGIN TRY
 EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@first,@DisplayName=N'STALE';
 THROW 53404,'Stale save accepted.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53309 THROW; END CATCH;
IF (SELECT COUNT(*) FROM dbo.AuthorProfileRevisions WHERE AuthorId=@profile)<>2 OR (SELECT LatestProfileRevisionId FROM dbo.Authors WHERE Id=@profile)<>@second
 THROW 53405,'Conflict changed retained history.',1;
-- Full role matrix: own creation, cross-owner save and cross-owner history.
SET @mask=0;
WHILE @mask<8
BEGIN
 SELECT @session=sessionId,@id=id FROM @people WHERE mask=@mask;
 IF (@mask & 1)=0
 BEGIN
  BEGIN TRY
   EXEC dbo.AuthorProfileOperation @SessionId=@session,@Action='save',@DisplayName=N'DENIED';
   THROW 53406,'Non-writer saved.',1;
  END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
 END
 ELSE
 BEGIN
  IF @mask<>1 EXEC dbo.AuthorProfileOperation @SessionId=@session,@Action='save',@DisplayName=N'Private new profile';
  IF NOT EXISTS(SELECT 1 FROM dbo.Authors WHERE ActorId=CONVERT(uniqueidentifier,@id) AND LatestProfileRevisionId IS NOT NULL)
   THROW 53407,'Writer could not create own profile.',1;
 END;
 IF (@mask & 5)<>5 AND @mask<>1
 BEGIN
  BEGIN TRY
   EXEC dbo.AuthorProfileOperation @SessionId=@session,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@second,@DisplayName=N'CROSS OWNER';
   THROW 53408,'Cross-owner save accepted.',1;
  END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
  BEGIN TRY
   EXEC dbo.AuthorProfileOperation @SessionId=@session,@Action='read',@ProfileId=@profile;
   THROW 53409,'Cross-owner history disclosed.',1;
  END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
 END;
 IF (@mask & 5)=5
 BEGIN
  EXEC dbo.AuthorProfileOperation @SessionId=@session,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@second,@DisplayName=N'Administrator writer replacement';
  SELECT @second=LatestProfileRevisionId FROM dbo.Authors WHERE Id=@profile;
  IF NOT EXISTS(SELECT 1 FROM dbo.AuthorProfileRevisions WHERE Id=@second AND SavedByActorId=CONVERT(uniqueidentifier,@id)) THROW 53410,'Administrator save attributed to wrong actor.',1;
 END;
 SET @mask+=1;
END;
IF NOT EXISTS(SELECT 1 FROM dbo.PublicArticles WHERE ArticleId=@article AND AuthorDisplayName=N'Approved pen name') THROW 53411,'Cross-owner save changed public attribution.',1;
-- Even an approved article must not expose a first, unapproved profile.
DECLARE @privateAuthor uniqueidentifier;
SELECT @privateAuthor=p.Id FROM dbo.Authors p JOIN @people u ON p.ActorId=CONVERT(uniqueidentifier,u.id) WHERE u.mask=3;
UPDATE dbo.Articles SET PrimaryAuthorId=@privateAuthor WHERE Id=@article;
IF EXISTS(SELECT 1 FROM dbo.PublicArticles WHERE ArticleId=@article) THROW 53424,'First unapproved profile disclosed through an article.',1;
UPDATE dbo.Articles SET PrimaryAuthorId=@profile WHERE Id=@article;
-- The legacy mutable columns are no longer an anonymous attribution source.
UPDATE dbo.Authors SET DisplayName=N'PRIVATE direct change',Biography=N'PRIVATE direct biography' WHERE Id=@profile;
IF NOT EXISTS(SELECT 1 FROM dbo.PublicArticles WHERE ArticleId=@article AND AuthorDisplayName=N'Approved pen name' AND AuthorBiography=N'Approved biography')
 THROW 53425,'Legacy author fields bypassed approved attribution.',1;
-- A persistence failure must not advance the head or leave a successful save.
DECLARE @before int=(SELECT COUNT(*) FROM dbo.AuthorProfileRevisions WHERE AuthorId=@profile);
EXEC sys.sp_executesql N'CREATE TRIGGER dbo.ProfileVerificationFailure ON dbo.AuthorProfileRevisions AFTER INSERT AS BEGIN THROW 53420,''Deliberate disposable insert failure.'',1; END';
BEGIN TRY
 EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@second,@DisplayName=N'FAILED SAVE';
 THROW 53421,'Deliberate persistence failure was ignored.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53420 THROW; END CATCH;
DROP TRIGGER dbo.ProfileVerificationFailure;
IF (SELECT COUNT(*) FROM dbo.AuthorProfileRevisions WHERE AuthorId=@profile)<>@before OR (SELECT LatestProfileRevisionId FROM dbo.Authors WHERE Id=@profile)<>@second
 THROW 53422,'Failed save left partial history or changed the head.',1;
BEGIN TRY
 UPDATE dbo.AuthorProfileRevisions SET DisplayName=N'OVERWRITE' WHERE Id=@first;
 THROW 53423,'Retained snapshot was mutable.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53320 THROW; END CATCH;
-- Role/session changes must be rechecked, rather than trusting a prior page load.
DELETE dbo.AuthRoleAssignments WHERE UserId=@owner AND Role='Writer';
BEGIN TRY
 EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='save',@ProfileId=@profile,@ExpectedRevisionId=@second,@DisplayName=N'REVOKED';
 THROW 53412,'Revoked role still saved.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
INSERT dbo.AuthRoleAssignments(UserId,Role) VALUES(@owner,'Writer');
UPDATE dbo.AuthUsers SET disabled=1 WHERE id=@owner;
BEGIN TRY
 EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='read',@ProfileId=@profile;
 THROW 53413,'Disabled account read history.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
UPDATE dbo.AuthUsers SET disabled=0 WHERE id=@owner;
DELETE dbo.AuthSessions WHERE id=@ownerSession;
BEGIN TRY
 EXEC dbo.AuthorProfileOperation @SessionId=@ownerSession,@Action='read',@ProfileId=@profile;
 THROW 53414,'Revoked session read history.',1;
END TRY BEGIN CATCH IF ERROR_NUMBER()<>53303 THROW; END CATCH;
PRINT 'Profile persistence, ownership, full role matrix, live authorization, stale saves and approved projection passed. Fictional fixtures retained in this disposable database.';
