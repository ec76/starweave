CREATE VIEW dbo.PublicArticles
AS
SELECT
    a.Id AS ArticleId, a.Slug, a.Language, a.FirstPublishedAt, a.PublishedAt,
    r.Id AS RevisionId, r.RevisionNumber, r.Title, r.Summary, r.BodyJson,
    r.SeoDescription, r.SharingImageUrl, r.SharingImageAlt,
    p.Id AS AuthorId, p.Slug AS AuthorSlug, p.DisplayName AS AuthorDisplayName,
    p.Biography AS AuthorBiography, p.PhotoUrl AS AuthorPhotoUrl,
    p.PhotoAlt AS AuthorPhotoAlt, p.Affiliation AS AuthorAffiliation
FROM dbo.Articles AS a
JOIN dbo.ArticleRevisions AS r ON r.ArticleId = a.Id AND r.Id = a.PublishedRevisionId
JOIN dbo.Authors AS p ON p.Id = a.PrimaryAuthorId
WHERE a.ArchivedAt IS NULL AND r.Status = 'approved' AND a.PublishedAt IS NOT NULL;
