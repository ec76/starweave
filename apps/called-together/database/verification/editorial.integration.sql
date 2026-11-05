-- OPT-IN ONLY. Run after migrations in an empty disposable database whose name
-- ends with _migration_test. Never run on the live development database.
-- All fictional fixtures roll back, including when an assertion fails.
DECLARE @expectedDatabase sysname = CONVERT(sysname, SESSION_CONTEXT(N'CalledTogetherVerificationDatabase'));
IF @expectedDatabase IS NULL OR DB_NAME() COLLATE Latin1_General_100_BIN2 <> @expectedDatabase COLLATE Latin1_General_100_BIN2
    OR RIGHT(DB_NAME(), 15) <> N'_migration_test' OR DB_NAME() = N'sqldb-called-together-dev'
    THROW 52000, 'Explicitly select the exact disposable database ending in _migration_test.', 1;
IF @@TRANCOUNT <> 0 THROW 52019, 'Run verification without an existing transaction.', 1;
SET NOCOUNT ON;
SET XACT_ABORT OFF;
BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @actor uniqueidentifier = NEWID(), @reviewer uniqueidentifier = NEWID(),
        @author uniqueidentifier = NEWID(), @external uniqueidentifier = NEWID(),
        @article uniqueidentifier = NEWID(), @otherArticle uniqueidentifier = NEWID(),
        @revision uniqueidentifier = NEWID(), @otherRevision uniqueidentifier = NEWID(),
        @draft uniqueidentifier = NEWID(), @now datetime2(3) = SYSUTCDATETIME(),
        -- GUID text can contain uppercase A-F; slugs require lowercase ASCII.
        @slug varchar(160) = 'verification-' + LOWER(CONVERT(varchar(36), NEWID()));
    INSERT dbo.EditorialActors (Id, Issuer, Subject, DisplayName, CreatedAt, UpdatedAt)
        VALUES (@actor, N'https://fictional.invalid', N'fictional-writer', N'Fictional writer', @now, @now),
               (@reviewer, N'https://fictional.invalid', N'fictional-reviewer', N'Fictional reviewer', @now, @now);
    INSERT dbo.Authors (Id, Slug, DisplayName, ActorId, CreatedAt, UpdatedAt)
        VALUES (@author, @slug, N'Fictional author', @actor, @now, @now),
               (@external, @slug + '-external', N'Fictional external contributor', NULL, @now, @now);
    INSERT dbo.Articles (Id, PrimaryAuthorId, Language, Slug, CreatedAt, UpdatedAt)
        VALUES (@article, @author, 'es', @slug, @now, @now),
               (@otherArticle, @external, 'en', @slug + '-other', @now, @now);
    INSERT dbo.ArticleRevisions (Id, ArticleId, RevisionNumber, Title, Summary, BodyJson, CreatedByActorId, CreatedAt, UpdatedAt)
        VALUES (@revision, @article, 1, N'Fictional published title', N'Fictional summary', N'{"version":1,"format":"called-together.rich-text","content":{}}', @actor, @now, @now),
               (@draft, @article, 2, N'PRIVATE DRAFT', N'Fictional draft', N'{"version":1,"format":"called-together.rich-text","content":{}}', @actor, @now, @now),
               (@otherRevision, @otherArticle, 1, N'Other fictional draft', N'Fictional summary', N'{}', @actor, @now, @now);
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId IN (@article, @otherArticle))
        THROW 52001, 'Draft-only articles leaked.', 1;

    DECLARE @oldVersion binary(8) = (SELECT RowVersion FROM dbo.ArticleRevisions WHERE Id = @draft);
    UPDATE dbo.ArticleRevisions SET Summary = N'Changed fictional draft' WHERE Id = @draft AND RowVersion = @oldVersion;
    IF @@ROWCOUNT <> 1 OR (SELECT RowVersion FROM dbo.ArticleRevisions WHERE Id = @draft) = @oldVersion
        THROW 52002, 'Rowversion did not change.', 1;
    UPDATE dbo.ArticleRevisions SET Summary = N'Stale update' WHERE Id = @draft AND RowVersion = @oldVersion;
    IF @@ROWCOUNT <> 0 THROW 52003, 'Stale rowversion update succeeded.', 1;

    BEGIN TRY
        UPDATE dbo.ArticleRevisions SET BodyJson = N'{invalid' WHERE Id = @draft;
        THROW 52004, 'Invalid JSON accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 OR CHARINDEX('CK_ArticleRevisions_Json', ERROR_MESSAGE()) = 0 THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.ArticleRevisions SET Status = 'published', SubmittedByActorId = @actor, SubmittedAt = @now WHERE Id = @draft;
        THROW 52005, 'Invalid status accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 OR CHARINDEX('CK_ArticleRevisions_Status', ERROR_MESSAGE()) = 0 THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.Articles SET Language = 'fr' WHERE Id = @article;
        THROW 52006, 'Unsupported language accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.Articles SET Slug = @slug WHERE Id = @otherArticle;
        THROW 52007, 'Duplicate article slug accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.ArticleRevisions SET RevisionNumber = 1 WHERE Id = @draft;
        THROW 52008, 'Duplicate revision number accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.ArticleRevisions SET CreatedByActorId = NEWID() WHERE Id = @draft;
        THROW 52009, 'Missing actor accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 THROW;
    END CATCH;
    BEGIN TRY
        INSERT dbo.EditorialActors (Issuer, Subject, DisplayName)
            VALUES (N'https://fictional.invalid', N'fictional-writer', N'Duplicate fictional identity');
        THROW 52010, 'Duplicate actor identity accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH;
    -- Regression: normalize the fixture instead of relaxing the slug constraint.
    BEGIN TRY
        UPDATE dbo.Authors SET Slug = UPPER(@slug) WHERE Id = @author;
        THROW 52025, 'Uppercase author slug accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 OR CHARINDEX('CK_Authors_Slug', ERROR_MESSAGE()) = 0 THROW;
    END CATCH;
    BEGIN TRY
        UPDATE dbo.Authors SET Slug = @slug WHERE Id = @external;
        THROW 52011, 'Duplicate author slug accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() NOT IN (2601, 2627) THROW;
    END CATCH;

    UPDATE dbo.ArticleRevisions SET Status = 'approved', SubmittedByActorId = @actor, SubmittedAt = @now WHERE Id = @revision;
    INSERT dbo.ReviewDecisions (RevisionId, ReviewerActorId, Decision, ReviewComment)
        VALUES (@revision, @reviewer, 'approved', N'PRIVATE REVIEW COMMENT');
    UPDATE dbo.Articles SET PublishedRevisionId = @revision, FirstPublishedAt = @now, PublishedAt = @now WHERE Id = @article;
    IF (SELECT COUNT(*) FROM dbo.PublicArticles WHERE ArticleId = @article AND RevisionId = @revision AND Title = N'Fictional published title' AND AuthorDisplayName = N'Fictional author') <> 1
        THROW 52012, 'Approved selected revision not exposed correctly.', 1;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE RevisionId = @draft OR ArticleId = @otherArticle)
        THROW 52013, 'Unselected draft leaked.', 1;
    BEGIN TRY
        UPDATE dbo.Articles SET PublishedRevisionId = @otherRevision WHERE Id = @article;
        THROW 52014, 'Cross-article publication pointer accepted.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 OR CHARINDEX('FK_Articles_PublishedRevision', ERROR_MESSAGE()) = 0 THROW;
    END CATCH;
    -- Approval without selection must not expose the other article.
    UPDATE dbo.ArticleRevisions SET Status = 'approved', SubmittedByActorId = @actor, SubmittedAt = @now WHERE Id = @otherRevision;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @otherArticle)
        THROW 52020, 'Unselected approved revision leaked.', 1;
    -- Exercise every unapproved state while a revision is selected.
    UPDATE dbo.Articles SET PublishedRevisionId = @draft WHERE Id = @article;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @article)
        THROW 52021, 'Selected draft leaked.', 1;
    UPDATE dbo.ArticleRevisions SET Status = 'submitted', SubmittedByActorId = @actor, SubmittedAt = @now WHERE Id = @draft;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @article)
        THROW 52022, 'Selected submitted revision leaked.', 1;
    UPDATE dbo.Articles SET PublishedRevisionId = @revision WHERE Id = @article;
    UPDATE dbo.ArticleRevisions SET Status = 'changes_requested' WHERE Id = @revision;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @article)
        THROW 52015, 'Unapproved selected revision leaked.', 1;
    UPDATE dbo.ArticleRevisions SET Status = 'approved' WHERE Id = @revision;
    UPDATE dbo.Articles SET ArchivedAt = @now WHERE Id = @article;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @article)
        THROW 52016, 'Archived article leaked.', 1;
    UPDATE dbo.Articles SET ArchivedAt = NULL, PublishedRevisionId = NULL, PublishedAt = NULL WHERE Id = @article;
    IF EXISTS (SELECT 1 FROM dbo.PublicArticles WHERE ArticleId = @article)
        OR (SELECT FirstPublishedAt FROM dbo.Articles WHERE Id = @article) <> @now
        THROW 52023, 'Unpublishing leaked content or lost the first-publication date.', 1;
    BEGIN TRY
        DELETE dbo.ArticleRevisions WHERE Id = @revision;
        THROW 52017, 'Editorial history deletion cascaded.', 1;
    END TRY BEGIN CATCH
        IF ERROR_NUMBER() <> 547 OR CHARINDEX('FK_ReviewDecisions_Revision', ERROR_MESSAGE()) = 0 THROW;
    END CATCH;
    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.PublicArticles')
        AND name IN ('ActorId', 'Issuer', 'Subject', 'CreatedByActorId', 'SubmittedByActorId', 'ReviewerActorId', 'ReviewComment'))
        THROW 52018, 'Internal fields exposed by public view.', 1;
    ROLLBACK TRANSACTION;
    IF EXISTS (SELECT 1 FROM dbo.EditorialActors WHERE Id IN (@actor, @reviewer))
        OR EXISTS (SELECT 1 FROM dbo.Authors WHERE Id IN (@author, @external))
        OR EXISTS (SELECT 1 FROM dbo.Articles WHERE Id IN (@article, @otherArticle))
        OR EXISTS (SELECT 1 FROM dbo.ArticleRevisions WHERE Id IN (@revision, @draft, @otherRevision))
        OR EXISTS (SELECT 1 FROM dbo.ReviewDecisions WHERE RevisionId = @revision)
        THROW 52024, 'Verification fixtures survived rollback.', 1;
    PRINT 'Disposable SQL constraint/public-view verification passed; fixtures rolled back.';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
