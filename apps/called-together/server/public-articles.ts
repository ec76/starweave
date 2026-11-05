import "server-only";
import sql from "mssql";
import { isArticleBody, isArticleLanguage, isSlug } from "../domain/editorial";
import type {
  PublishedArticleDto,
  PublishedArticleListDto,
  PublishedArticleSummaryDto,
} from "../domain/published-articles";
import { database } from "./database";
import {
  publicDetailColumns,
  publicSummaryColumns,
} from "./public-article-query";

export const maxArticlePage = 10000;
export class ArticleInputError extends Error {}
export interface ArticlePagination {
  readonly page: number;
  readonly pageSize: number;
}
export function articlePagination(params: URLSearchParams): ArticlePagination {
  for (const name of params.keys()) {
    if (
      (name !== "page" && name !== "pageSize") ||
      params.getAll(name).length !== 1
    )
      throw new ArticleInputError(
        "Use each supported query parameter at most once.",
      );
  }
  function integer(name: string, fallback: number, maximum: number): number {
    const text = params.get(name);
    if (text === null) return fallback;
    if (!/^[1-9][0-9]{0,4}$/.test(text) || Number(text) > maximum)
      throw new ArticleInputError("Invalid pagination.");
    return Number(text);
  }
  return {
    page: integer("page", 1, maxArticlePage),
    pageSize: integer("pageSize", 20, 50),
  };
}
export function articleSlug(slug: unknown, params: URLSearchParams): string {
  if (!isSlug(slug) || params.size !== 0)
    throw new ArticleInputError("Invalid article URL.");
  return slug;
}

interface PublicSummaryRow {
  ArticleId: string;
  Slug: string;
  Language: string;
  FirstPublishedAt: Date;
  PublishedAt: Date;
  Title: string;
  Summary: string;
  SharingImageUrl: string | null;
  SharingImageAlt: string | null;
  AuthorId: string;
  AuthorSlug: string;
  AuthorDisplayName: string;
  AuthorBiography: string | null;
  AuthorPhotoUrl: string | null;
  AuthorPhotoAlt: string | null;
  AuthorAffiliation: string | null;
}
interface PublicDetailRow extends PublicSummaryRow {
  BodyJson: string;
  SeoDescription: string | null;
}
function summaryDto(row: PublicSummaryRow): PublishedArticleSummaryDto {
  if (!isArticleLanguage(row.Language))
    throw new Error("Invalid stored article language.");
  return {
    id: row.ArticleId,
    slug: row.Slug,
    language: row.Language,
    title: row.Title,
    summary: row.Summary,
    firstPublishedAt: row.FirstPublishedAt.toISOString(),
    publishedAt: row.PublishedAt.toISOString(),
    sharingImageUrl: row.SharingImageUrl,
    sharingImageAlt: row.SharingImageAlt,
    author: {
      id: row.AuthorId,
      slug: row.AuthorSlug,
      displayName: row.AuthorDisplayName,
      biography: row.AuthorBiography,
      photoUrl: row.AuthorPhotoUrl,
      photoAlt: row.AuthorPhotoAlt,
      affiliation: row.AuthorAffiliation,
    },
  };
}
export async function listPublishedArticles(
  pagination: ArticlePagination,
): Promise<PublishedArticleListDto> {
  const pool = await database.getPool();
  const result = await pool
    .request()
    .input("offset", sql.Int, (pagination.page - 1) * pagination.pageSize)
    .input("take", sql.Int, pagination.pageSize + 1)
    .query<PublicSummaryRow>(`SELECT ${publicSummaryColumns} FROM dbo.PublicArticles
ORDER BY PublishedAt DESC, ArticleId ASC
OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY`);
  return {
    items: result.recordset.slice(0, pagination.pageSize).map(summaryDto),
    pagination: {
      page: pagination.page,
      pageSize: pagination.pageSize,
      hasMore: result.recordset.length > pagination.pageSize,
    },
  };
}
export async function findPublishedArticle(
  slug: string,
): Promise<PublishedArticleDto | null> {
  const pool = await database.getPool();
  const result = await pool
    .request()
    .input("slug", sql.VarChar(160), slug)
    .query<PublicDetailRow>(
      `SELECT ${publicDetailColumns} FROM dbo.PublicArticles WHERE Slug = @slug`,
    );
  const row = result.recordset[0];
  if (!row) return null;
  const body: unknown = JSON.parse(row.BodyJson);
  if (!isArticleBody(body))
    throw new Error("Invalid stored article body envelope.");
  return {
    ...summaryDto(row),
    seoDescription: row.SeoDescription,
    body: { version: 1, format: body.format, content: body.content },
  };
}
