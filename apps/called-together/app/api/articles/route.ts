import {
  articlePagination,
  listPublishedArticles,
} from "../../../server/public-articles";
import { articleFailure, articleJson } from "../../../server/article-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const pagination = articlePagination(new URL(request.url).searchParams);
    return articleJson(await listPublishedArticles(pagination));
  } catch (error) {
    return articleFailure(error);
  }
}
