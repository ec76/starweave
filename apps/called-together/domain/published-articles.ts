import type {
  ArticleBodyV1,
  ArticleLanguage,
  PublicAuthor,
} from "./editorial.js";

/** Explicit anonymous-read contract; no actor, review or draft fields. */
export interface PublishedArticleSummaryDto {
  readonly id: string;
  readonly slug: string;
  readonly language: ArticleLanguage;
  readonly title: string;
  readonly summary: string;
  readonly firstPublishedAt: string;
  readonly publishedAt: string;
  readonly sharingImageUrl: string | null;
  readonly sharingImageAlt: string | null;
  readonly author: PublicAuthor;
}
export interface PublishedArticleDto extends PublishedArticleSummaryDto {
  readonly body: ArticleBodyV1;
  readonly seoDescription: string | null;
}
export interface PublishedArticleListDto {
  readonly items: PublishedArticleSummaryDto[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly hasMore: boolean;
  };
}
