import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  loadArticleDetail,
  articleDetailMetadata,
} from "../../../server/article-pages";
import { ArticlePreview, ArticlesListing } from "../article-views";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Props {
  params: Promise<{ slug: string }>;
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return articleDetailMetadata(await loadArticleDetail((await params).slug));
}
export default async function ArticlePage({ params }: Props) {
  const state = await loadArticleDetail((await params).slug);
  if (state.kind === "missing") notFound();
  return state.kind === "unavailable" ? (
    <ArticlesListing model={state} />
  ) : (
    <ArticlePreview model={state.preview} />
  );
}
