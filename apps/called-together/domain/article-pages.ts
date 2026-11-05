export interface ArticleCardView {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly description: string;
  readonly author: string;
  readonly language: string;
  readonly publication: string;
}
export interface ArticleListingView {
  readonly kind: "ready";
  readonly cards: readonly ArticleCardView[];
  readonly emptyHeading: string;
  readonly pageLabel: string;
  readonly previousHref: string | null;
  readonly nextHref: string | null;
}
export interface ArticlePreviewView {
  readonly title: string;
  readonly summary: string;
  readonly author: string;
  readonly language: string;
  readonly languageTag: "en" | "es";
  readonly firstPublished: { readonly iso: string; readonly label: string };
  readonly published: { readonly iso: string; readonly label: string };
}
export interface ArticlesUnavailableView {
  readonly kind: "unavailable";
}
