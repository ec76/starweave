import "server-only";

// These projections are source constants. No caller-supplied identifiers or SQL.
export const publicSummaryColumns = `ArticleId, Slug, Language, FirstPublishedAt, PublishedAt,
Title, Summary, SharingImageUrl, SharingImageAlt,
AuthorId, AuthorSlug, AuthorDisplayName, AuthorBiography, AuthorPhotoUrl, AuthorPhotoAlt, AuthorAffiliation`;
export const publicDetailColumns = `${publicSummaryColumns}, BodyJson, SeoDescription`;
export const publicArticlesSelectProbe = `SELECT TOP (1) ${publicDetailColumns} FROM dbo.PublicArticles`;
