import sql from "mssql";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getPool: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./database.js", () => ({ database: { getPool: mocks.getPool } }));
import { GET as list } from "../app/api/articles/route.js";
import { GET as detail } from "../app/api/articles/[slug]/route.js";
import { articlePagination } from "./public-articles.js";

const row = {
  ArticleId: "article-1",
  Slug: "fictional-article",
  Language: "es",
  Title: "Fictional title",
  Summary: "Fictional summary",
  FirstPublishedAt: new Date("2026-11-01T10:00:00.000Z"),
  PublishedAt: new Date("2026-11-05T12:00:00.000Z"),
  SharingImageUrl: null,
  SharingImageAlt: null,
  AuthorId: "author-1",
  AuthorSlug: "fictional-author",
  AuthorDisplayName: "Fictional author",
  AuthorBiography: null,
  AuthorPhotoUrl: null,
  AuthorPhotoAlt: null,
  AuthorAffiliation: "Fictional affiliation",
  BodyJson: JSON.stringify({
    version: 1,
    format: "called-together.rich-text",
    content: { blocks: [] },
    internalExtra: "DO NOT EXPOSE",
  }),
  SeoDescription: "Fictional SEO description",
  ActorId: "PRIVATE ACTOR",
  ReviewerActorId: "PRIVATE REVIEWER",
  ReviewComment: "PRIVATE COMMENT",
  Issuer: "PRIVATE ISSUER",
};
const request = (query = "") =>
  new Request("https://fictional.invalid/api/articles" + query);
const context = (slug = "fictional-article") => ({
  params: Promise.resolve({ slug }),
});
let query: ReturnType<typeof vi.fn>;
let input: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  query = vi.fn().mockResolvedValue({ recordset: [] });
  input = vi.fn().mockReturnThis();
  mocks.getPool.mockResolvedValue({ request: () => ({ input, query }) });
});
function uncached(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("access-control-allow-origin")).toBeNull();
}

describe("published article list API", () => {
  it("returns an anonymous successful empty list with default bounded pagination", async () => {
    expect(mocks.getPool).not.toHaveBeenCalled();
    const response = await list(request());
    expect(response.status).toBe(200);
    uncached(response);
    expect(await response.json()).toEqual({
      items: [],
      pagination: { page: 1, pageSize: 20, hasMore: false },
    });
    expect(input).toHaveBeenCalledWith("offset", sql.Int, 0);
    expect(input).toHaveBeenCalledWith("take", sql.Int, 21);
  });
  it.each([
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=1e2",
    "?page=01",
    "?page=10001",
    "?page=",
    "?pageSize=0",
    "?pageSize=51",
    "?pageSize=999999999999999999",
    "?page=1&page=2",
    "?pageSize=2&pageSize=2",
    "?sort=Title",
    "?page=1%3BDROP%20TABLE%20Articles",
    "?page=%20%20",
  ])("rejects invalid query %s without SQL", async (search) => {
    const response = await list(request(search));
    expect(response.status).toBe(400);
    uncached(response);
    expect(await response.json()).toEqual({
      error: "Invalid article request.",
    });
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
  it("uses typed paging parameters, a deterministic SQL order and an extra row for hasMore", async () => {
    query.mockResolvedValue({
      recordset: [
        row,
        { ...row, ArticleId: "article-2" },
        { ...row, Language: "invalid-extra-row" },
      ],
    });
    const response = await list(request("?page=2&pageSize=2"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items.map((item: { id: string }) => item.id)).toEqual([
      "article-1",
      "article-2",
    ]);
    expect(body.pagination).toEqual({ page: 2, pageSize: 2, hasMore: true });
    expect(input).toHaveBeenCalledWith("offset", sql.Int, 2);
    expect(input).toHaveBeenCalledWith("take", sql.Int, 3);
    const statement = query.mock.calls[0]![0] as string;
    expect(statement).toContain("FROM dbo.PublicArticles");
    expect(statement).toContain("ORDER BY PublishedAt DESC, ArticleId ASC");
    expect(statement).toContain(
      "OFFSET @offset ROWS FETCH NEXT @take ROWS ONLY",
    );
    expect(statement).not.toMatch(
      /SELECT\s+\*|BodyJson|dbo\.(Articles|ArticleRevisions|EditorialActors|ReviewDecisions)\b/,
    );
    expect(body.items[0]).toEqual({
      id: row.ArticleId,
      slug: row.Slug,
      language: "es",
      title: row.Title,
      summary: row.Summary,
      firstPublishedAt: "2026-11-01T10:00:00.000Z",
      publishedAt: "2026-11-05T12:00:00.000Z",
      sharingImageUrl: null,
      sharingImageAlt: null,
      author: {
        id: row.AuthorId,
        slug: row.AuthorSlug,
        displayName: row.AuthorDisplayName,
        biography: null,
        photoUrl: null,
        photoAlt: null,
        affiliation: row.AuthorAffiliation,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /PRIVATE|BodyJson|body|internalExtra/,
    );
  });
  it("bounds the maximum offset and indicates a terminal partial page", async () => {
    query.mockResolvedValue({ recordset: [row] });
    const response = await list(request("?page=10000&pageSize=50"));
    expect(input).toHaveBeenCalledWith("offset", sql.Int, 499950);
    expect(input).toHaveBeenCalledWith("take", sql.Int, 51);
    expect((await response.json()).pagination.hasMore).toBe(false);
    expect(
      articlePagination(new URLSearchParams("page=10000&pageSize=50")),
    ).toEqual({ page: 10000, pageSize: 50 });
  });
});

describe("published article detail API", () => {
  it.each([
    "UPPER",
    "two--parts",
    "-start",
    "end-",
    "has space",
    "../route",
    "a/b",
    "a' OR 1=1--",
    "a".repeat(161),
    "",
  ])("rejects invalid slug %s before SQL", async (slug) => {
    const response = await detail(request(), context(slug));
    expect(response.status).toBe(400);
    uncached(response);
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
  it("rejects unsupported detail query parameters", async () => {
    expect((await detail(request("?preview=true"), context())).status).toBe(
      400,
    );
    expect(mocks.getPool).not.toHaveBeenCalled();
  });
  it("returns 404 when the public view has no matching published article", async () => {
    const response = await detail(request(), context("missing-article"));
    expect(response.status).toBe(404);
    uncached(response);
    expect(await response.json()).toEqual({ error: "Article not found." });
    expect(input).toHaveBeenCalledWith(
      "slug",
      sql.VarChar(160),
      "missing-article",
    );
    const statement = query.mock.calls[0]![0] as string;
    expect(statement).toContain("FROM dbo.PublicArticles WHERE Slug = @slug");
    expect(statement).not.toContain("missing-article");
  });
  it("maps only public fields and the versioned body envelope, using a typed slug parameter", async () => {
    query.mockResolvedValue({ recordset: [row] });
    const response = await detail(request(), context());
    expect(response.status).toBe(200);
    uncached(response);
    const result = await response.json();
    expect(result.body).toEqual({
      version: 1,
      format: "called-together.rich-text",
      content: { blocks: [] },
    });
    expect(result.seoDescription).toBe(row.SeoDescription);
    expect(result.author.displayName).toBe(row.AuthorDisplayName);
    expect(result.publishedAt).toBe(row.PublishedAt.toISOString());
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|DO NOT EXPOSE|BodyJson|internalExtra|ActorId|ReviewComment/,
    );
    expect(input).toHaveBeenCalledWith("slug", sql.VarChar(160), row.Slug);
    expect(query.mock.calls[0]![0]).not.toMatch(/SELECT\s+\*/);
  });
  it("queries again on the next request rather than caching an unpublished article", async () => {
    query
      .mockResolvedValueOnce({ recordset: [row] })
      .mockResolvedValueOnce({ recordset: [] });
    expect((await detail(request(), context())).status).toBe(200);
    expect((await detail(request(), context())).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it.each([
    "not JSON",
    "{}",
    '{"version":2,"format":"called-together.rich-text","content":{}}',
  ])("fails closed for an unsupported stored body: %s", async (body) => {
    query.mockResolvedValue({ recordset: [{ ...row, BodyJson: body }] });
    const response = await detail(request(), context());
    expect(response.status).toBe(503);
    uncached(response);
    expect(await response.json()).toEqual({
      error: "Published articles are temporarily unavailable.",
    });
  });
});

describe("unavailable public article source", () => {
  it.each(["connection", "query"])(
    "returns generic uncached 503s for %s failures on both routes",
    async (failure) => {
      if (failure === "connection")
        mocks.getPool.mockRejectedValue(new Error("SECRET TOKEN HOST CONTENT"));
      else
        query.mockRejectedValue({
          code: "EREQUEST",
          message: "SECRET TOKEN HOST CONTENT",
        });
      for (const response of [
        await list(request()),
        await detail(request(), context()),
      ]) {
        expect(response.status).toBe(503);
        uncached(response);
        expect(await response.json()).toEqual({
          error: "Published articles are temporarily unavailable.",
        });
      }
    },
  );
});
