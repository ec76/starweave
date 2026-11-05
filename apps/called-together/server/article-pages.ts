import "server-only";
import { cache } from "react";
import type { Metadata } from "next";
import type {
  PublishedArticleDto,
  PublishedArticleSummaryDto,
} from "../domain/published-articles";
import type {
  ArticleCardView,
  ArticleListingView,
  ArticlePreviewView,
  ArticlesUnavailableView,
} from "../domain/article-pages";
import {
  ArticleInputError,
  articlePagination,
  articleSlug,
  listPublishedArticles,
  findPublishedArticle,
  maxArticlePage,
} from "./public-articles";

export type ArticleSearchParams = Record<string, string | string[] | undefined>;
export function articleSearchQuery(params: ArticleSearchParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === "string") query.append(name, value);
    else for (const part of value ?? []) query.append(name, part);
  }
  return query.toString();
}
export function articlePageHref(page: number, pageSize: number): string {
  const query = new URLSearchParams();
  if (page !== 1) query.set("page", String(page));
  if (pageSize !== 20) query.set("pageSize", String(pageSize));
  return "/articles" + (query.size ? "?" + query.toString() : "");
}
function publication(iso: string) {
  return {
    iso,
    label: new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(iso)),
  };
}
const languageLabel = { en: "English", es: "Espa\u00f1ol" } as const;
export function articleCard(
  article: PublishedArticleSummaryDto,
): ArticleCardView {
  return {
    id: article.id,
    title: article.title,
    href: `/articles/${article.slug}`,
    description: article.summary,
    author: `By ${article.author.displayName}`,
    language: languageLabel[article.language],
    publication: `Published ${publication(article.publishedAt).label}`,
  };
}
function articlePreview(article: PublishedArticleDto): ArticlePreviewView {
  return {
    title: article.title,
    summary: article.summary,
    author: article.author.displayName,
    language: languageLabel[article.language],
    languageTag: article.language,
    firstPublished: publication(article.firstPublishedAt),
    published: publication(article.publishedAt),
  };
}
export type ArticleListingState =
  | { readonly kind: "invalid" }
  | ArticlesUnavailableView
  | (ArticleListingView & { readonly href: string });
// React cache deduplicates metadata/page reads within a single server render;
// it does not retain published content across requests. Both routes are dynamic.
export const loadArticleListing = cache(
  async (query: string): Promise<ArticleListingState> => {
    let pagination;
    try {
      pagination = articlePagination(new URLSearchParams(query));
    } catch (error) {
      if (error instanceof ArticleInputError) return { kind: "invalid" };
      throw error;
    }
    try {
      const result = await listPublishedArticles(pagination);
      return {
        kind: "ready",
        cards: result.items.map(articleCard),
        href: articlePageHref(pagination.page, pagination.pageSize),
        emptyHeading:
          pagination.page === 1
            ? "Articles are coming soon."
            : "No articles on this page.",
        pageLabel: `Page ${pagination.page}`,
        previousHref:
          pagination.page > 1
            ? articlePageHref(pagination.page - 1, pagination.pageSize)
            : null,
        nextHref:
          result.pagination.hasMore && pagination.page < maxArticlePage
            ? articlePageHref(pagination.page + 1, pagination.pageSize)
            : null,
      };
    } catch {
      return { kind: "unavailable" };
    }
  },
);
export type ArticleDetailState =
  | { readonly kind: "missing" }
  | ArticlesUnavailableView
  | {
      readonly kind: "ready";
      readonly preview: ArticlePreviewView;
      readonly href: string;
      readonly description: string;
    };
export const loadArticleDetail = cache(
  async (value: string): Promise<ArticleDetailState> => {
    let slug;
    try {
      slug = articleSlug(value, new URLSearchParams());
    } catch (error) {
      if (error instanceof ArticleInputError) return { kind: "missing" };
      throw error;
    }
    try {
      const article = await findPublishedArticle(slug);
      if (!article) return { kind: "missing" };
      return {
        kind: "ready",
        preview: articlePreview(article),
        href: `/articles/${slug}`,
        description: article.seoDescription ?? article.summary,
      };
    } catch {
      return { kind: "unavailable" };
    }
  },
);
export function articleCanonical(
  href: string,
  origin = process.env.SITE_ORIGIN,
): string | undefined {
  if (!origin) return undefined;
  try {
    const base = new URL(origin);
    if (
      !["http:", "https:"].includes(base.protocol) ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    )
      return undefined;
    return new URL(href, base.origin).href;
  } catch {
    return undefined;
  }
}
export function articleListingMetadata(state: ArticleListingState): Metadata {
  const canonical =
    state.kind === "ready" ? articleCanonical(state.href) : undefined;
  return {
    title: "Articles | Called Together",
    description:
      "Explore Scripture, practical guidance, and perspectives on women in spiritual leadership.",
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(state.kind !== "ready"
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
export function articleDetailMetadata(state: ArticleDetailState): Metadata {
  const canonical =
    state.kind === "ready" ? articleCanonical(state.href) : undefined;
  return {
    title:
      state.kind === "ready"
        ? `${state.preview.title} | Called Together`
        : "Article unavailable | Called Together",
    description:
      state.kind === "ready"
        ? state.description
        : "Explore articles from Called Together.",
    ...(canonical ? { alternates: { canonical } } : {}),
    ...(state.kind !== "ready"
      ? { robots: { index: false, follow: true } }
      : {}),
  };
}
