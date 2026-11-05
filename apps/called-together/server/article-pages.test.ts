import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  find: vi.fn(),
  pathname: "/",
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("./public-articles", async (original) => ({
  ...(await original<typeof import("./public-articles")>()),
  listPublishedArticles: mocks.list,
  findPublishedArticle: mocks.find,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => mocks.pathname,
}));
import {
  articleCanonical,
  articleSearchQuery,
  articlePageHref,
  loadArticleListing,
  loadArticleDetail,
  articleListingMetadata,
  articleDetailMetadata,
} from "./article-pages";
import { SiteNavigation } from "../app/site-navigation";
import ArticlesPage from "../app/articles/page";
import ArticlePage from "../app/articles/[slug]/page";
import { ArticlesListing, ArticlePreview } from "../app/articles/article-views";
const article = {
  id: "fictional-id",
  slug: "fictional-article",
  language: "es",
  title: "Fictional title",
  summary: "Fictional summary",
  publishedAt: "2026-11-05T00:30:00.000Z",
  firstPublishedAt: "2026-11-01T12:00:00.000Z",
  sharingImageUrl: null,
  sharingImageAlt: null,
  author: {
    id: "fictional-author",
    slug: "fictional-author",
    displayName: "Fictional author",
    biography: null,
    photoUrl: null,
    photoAlt: null,
    affiliation: null,
  },
  seoDescription: "Fictional search description",
  body: {
    version: 1,
    format: "called-together.rich-text",
    content: { text: "BODY MUST NOT BE RENDERED" },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_ORIGIN", "");
  mocks.list.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, hasMore: false },
  });
  mocks.find.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("server article listing model and page", () => {
  it("renders the welcoming empty state without treating it as an error", async () => {
    const model = await loadArticleListing("");
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") throw new Error("Expected ready model");
    expect(model.cards).toEqual([]);
    expect(model.nextHref).toBeNull();
    expect(model.previousHref).toBeNull();
    const html = renderToString(ArticlesListing({ model }));
    expect(html).toContain("Articles are coming soon.");
    expect(html).not.toContain("temporarily unavailable");
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/href="[^\"]*page=/);
  });
  it("maps public cards and bounded navigation outside presentation, retaining pageSize", async () => {
    mocks.list.mockResolvedValue({
      items: [article],
      pagination: { page: 2, pageSize: 5, hasMore: true },
    });
    const model = await loadArticleListing("page=2&pageSize=5");
    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") throw new Error("Expected ready");
    expect(model.cards[0]).toMatchObject({
      href: "/articles/fictional-article",
      title: article.title,
      description: article.summary,
      author: "By Fictional author",
      language: "Espa\u00f1ol",
      publication: "Published November 5, 2026",
    });
    expect(model.previousHref).toBe("/articles?pageSize=5");
    expect(model.nextHref).toBe("/articles?page=3&pageSize=5");
    const html = renderToString(ArticlesListing({ model }));
    expect(html).toContain('href="/articles/fictional-article"');
    expect(html).toContain('aria-label="Article pages"');
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).not.toContain("BODY MUST NOT BE RENDERED");
  });
  it("does not navigate beyond the maximum page even if the lookahead reports more", async () => {
    mocks.list.mockResolvedValue({
      items: [],
      pagination: { page: 10000, pageSize: 50, hasMore: true },
    });
    const model = await loadArticleListing("page=10000&pageSize=50");
    expect(model).toMatchObject({
      nextHref: null,
      previousHref: "/articles?page=9999&pageSize=50",
      emptyHeading: "No articles on this page.",
    });
  });
  it.each([
    "page=0",
    "page=10001",
    "page=1&page=2",
    "pageSize=51",
    "preview=true",
  ])("rejects %s without SQL", async (query) => {
    expect(await loadArticleListing(query)).toEqual({ kind: "invalid" });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("preserves repeated Next search parameters for validation and returns a real notFound signal", async () => {
    expect(articleSearchQuery({ page: ["1", "2"], pageSize: undefined })).toBe(
      "page=1&page=2",
    );
    await expect(
      ArticlesPage({ searchParams: Promise.resolve({ page: ["1", "2"] }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("renders SQL failure distinctly and without leaking diagnostics", async () => {
    mocks.list.mockRejectedValue(new Error("PRIVATE SQL TOKEN"));
    const model = await loadArticleListing("");
    expect(model).toEqual({ kind: "unavailable" });
    const html = renderToString(
      await ArticlesPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Articles are temporarily unavailable.");
    expect(html).not.toContain("Articles are coming soon.");
    expect(html).not.toContain("PRIVATE");
    expect(articleListingMetadata(model)).toMatchObject({
      robots: { index: false },
    });
  });
  it("does not preserve an unavailable source across later requests outside a render", async () => {
    mocks.list
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce({
        items: [article],
        pagination: { page: 1, pageSize: 20, hasMore: false },
      });
    expect((await loadArticleListing("")).kind).toBe("unavailable");
    expect((await loadArticleListing("")).kind).toBe("ready");
  });
});
describe("minimal public article detail", () => {
  it("returns a real notFound signal for missing/unpublished detail and invalid slugs", async () => {
    await expect(
      ArticlePage({ params: Promise.resolve({ slug: "fictional-missing" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.find).toHaveBeenCalledWith("fictional-missing");
    mocks.find.mockClear();
    expect(await loadArticleDetail("UPPER")).toEqual({ kind: "missing" });
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("keeps an unavailable database distinct from a missing article", async () => {
    mocks.find.mockRejectedValue(new Error("PRIVATE DATABASE"));
    expect(await loadArticleDetail("fictional-article")).toEqual({
      kind: "unavailable",
    });
    const html = renderToString(
      await ArticlePage({
        params: Promise.resolve({ slug: "fictional-article" }),
      }),
    );
    expect(html).toContain("temporarily unavailable");
    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(html).not.toContain("PRIVATE");
  });
  it("server-renders only the summary and public metadata, never the body", async () => {
    mocks.find.mockResolvedValue(article);
    const state = await loadArticleDetail(article.slug);
    if (state.kind !== "ready") throw new Error("Expected ready");
    expect(state.preview).not.toHaveProperty("body");
    const html = renderToString(ArticlePreview({ model: state.preview }));
    expect(html).toContain(article.title);
    expect(html).toContain(article.summary);
    expect(html).toContain(article.author.displayName);
    expect(html).toContain('lang="es"');
    expect(html).toContain('dateTime="2026-11-05T00:30:00.000Z"');
    expect(html).toContain("Full article text is not available");
    expect(html).not.toContain("BODY MUST NOT BE RENDERED");
    expect(articleDetailMetadata(state)).toMatchObject({
      title: "Fictional title | Called Together",
      description: article.seoDescription,
    });
  });
});
describe("article metadata and canonical URLs", () => {
  it("omits canonical URLs unless a valid origin is configured", async () => {
    expect(articleCanonical("/articles")).toBeUndefined();
    for (const origin of [
      "invalid",
      "javascript:bad",
      "https://user:secret@example.invalid",
      "https://example.invalid/path",
      "https://example.invalid/?query=x",
    ])
      expect(articleCanonical("/articles", origin)).toBeUndefined();
    expect(
      articleCanonical("/articles?page=2", "https://example.invalid/"),
    ).toBe("https://example.invalid/articles?page=2");
    expect(
      articleListingMetadata(await loadArticleListing("")),
    ).not.toHaveProperty("alternates");
    vi.stubEnv("SITE_ORIGIN", "https://example.invalid");
    expect(
      articleListingMetadata(await loadArticleListing("page=2&pageSize=5")),
    ).toMatchObject({
      alternates: {
        canonical: "https://example.invalid/articles?page=2&pageSize=5",
      },
    });
  });
  it("uses consistent pagination hrefs and does not canonicalize error states", () => {
    expect(articlePageHref(1, 20)).toBe("/articles");
    vi.stubEnv("SITE_ORIGIN", "https://example.invalid");
    expect(articleDetailMetadata({ kind: "missing" })).not.toHaveProperty(
      "alternates",
    );
    expect(articleListingMetadata({ kind: "invalid" })).toMatchObject({
      robots: { index: false },
    });
  });
});

describe("article navigation", () => {
  it.each(["/articles", "/articles/fictional-article"])(
    "marks Articles current on %s without also marking Home",
    (pathname) => {
      mocks.pathname = pathname;
      const html = renderToString(SiteNavigation());
      const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
      expect(anchors.find((anchor) => anchor.includes(">Articles<"))).toContain(
        'aria-current="page"',
      );
      expect(anchors.find((anchor) => anchor.includes(">Home<"))).not.toContain(
        'aria-current="page"',
      );
    },
  );
});
