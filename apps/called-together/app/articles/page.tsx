import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  articleSearchQuery,
  loadArticleListing,
  articleListingMetadata,
  type ArticleSearchParams,
} from "../../server/article-pages";
import { ArticlesListing } from "./article-views";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
interface Props {
  searchParams: Promise<ArticleSearchParams>;
}
async function listing(props: Props) {
  return loadArticleListing(articleSearchQuery(await props.searchParams));
}
export async function generateMetadata(props: Props): Promise<Metadata> {
  return articleListingMetadata(await listing(props));
}
export default async function ArticlesPage(props: Props) {
  const state = await listing(props);
  if (state.kind === "invalid") notFound();
  return <ArticlesListing model={state} />;
}
