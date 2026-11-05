import {
  articleSlug,
  findPublishedArticle,
} from "../../../../server/public-articles";
import {
  articleFailure,
  articleJson,
} from "../../../../server/article-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  try {
    const { slug: value } = await context.params;
    const slug = articleSlug(value, new URL(request.url).searchParams);
    const article = await findPublishedArticle(slug);
    return article
      ? articleJson(article)
      : articleJson({ error: "Article not found." }, 404);
  } catch (error) {
    return articleFailure(error);
  }
}
