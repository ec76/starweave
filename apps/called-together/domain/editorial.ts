/** IDs are SQL uniqueidentifiers; timestamps are UTC ISO strings at the domain boundary. */
export type EntityId = string;
export type UtcTimestamp = string;
export type ArticleLanguage = "en" | "es";
export type RevisionStatus =
  "draft" | "submitted" | "changes_requested" | "approved";
export type ReviewOutcome = "approved" | "changes_requested";
/** Hex encoding of SQL's opaque 8-byte rowversion, not a date or revision number. */
export type RowVersion = `0x${string}`;
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface ArticleBodyV1 {
  readonly version: 1;
  readonly format: "called-together.rich-text";
  readonly content: { readonly [key: string]: JsonValue };
}
export interface Author {
  readonly id: EntityId;
  readonly slug: string;
  readonly displayName: string;
  readonly biography: string | null;
  readonly photoUrl: string | null;
  readonly photoAlt: string | null;
  readonly affiliation: string | null;
  readonly actorId: EntityId | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}
export type PublicAuthor = Omit<Author, "actorId" | "createdAt" | "updatedAt">;
export interface EditorialActor {
  readonly id: EntityId;
  readonly issuer: string;
  readonly subject: string;
  readonly displayName: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}
export interface Article {
  readonly id: EntityId;
  readonly primaryAuthorId: EntityId;
  readonly language: ArticleLanguage;
  readonly slug: string;
  readonly publishedRevisionId: EntityId | null;
  readonly firstPublishedAt: UtcTimestamp | null;
  readonly publishedAt: UtcTimestamp | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly archivedAt: UtcTimestamp | null;
}
export interface ArticleRevision {
  readonly id: EntityId;
  readonly articleId: EntityId;
  readonly revisionNumber: number;
  readonly title: string;
  readonly summary: string;
  readonly body: ArticleBodyV1;
  readonly seoDescription: string | null;
  readonly sharingImageUrl: string | null;
  readonly sharingImageAlt: string | null;
  readonly status: RevisionStatus;
  readonly createdByActorId: EntityId;
  readonly submittedByActorId: EntityId | null;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly submittedAt: UtcTimestamp | null;
  readonly rowVersion: RowVersion;
}
/** Append-only: add a new decision for an exact revision; never edit a prior decision. */
export interface ReviewDecision {
  readonly id: EntityId;
  readonly revisionId: EntityId;
  readonly reviewerActorId: EntityId;
  readonly decision: ReviewOutcome;
  readonly reviewComment: string | null;
  readonly decidedAt: UtcTimestamp;
}
export interface PublicArticle {
  readonly id: EntityId;
  readonly slug: string;
  readonly language: ArticleLanguage;
  readonly firstPublishedAt: UtcTimestamp;
  readonly publishedAt: UtcTimestamp;
  readonly revision: Pick<
    ArticleRevision,
    | "id"
    | "revisionNumber"
    | "title"
    | "summary"
    | "body"
    | "seoDescription"
    | "sharingImageUrl"
    | "sharingImageAlt"
  >;
  readonly author: PublicAuthor;
}

export function isArticleLanguage(value: unknown): value is ArticleLanguage {
  return value === "en" || value === "es";
}
export function isRevisionStatus(value: unknown): value is RevisionStatus {
  return (
    value === "draft" ||
    value === "submitted" ||
    value === "changes_requested" ||
    value === "approved"
  );
}
export function isReviewOutcome(value: unknown): value is ReviewOutcome {
  return value === "approved" || value === "changes_requested";
}
export function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 160 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}
export function isRowVersion(value: unknown): value is RowVersion {
  return typeof value === "string" && /^0x[0-9a-fA-F]{16}$/.test(value);
}
function isJson(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): value is JsonValue {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 64 || ancestors.has(value))
    return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  ancestors.add(value);
  const entries = Array.isArray(value)
    ? Array.from(value)
    : Object.values(value);
  const valid = entries.every((entry) => isJson(entry, ancestors, depth + 1));
  ancestors.delete(value);
  return valid;
}
/** Validates the envelope only, not editor structure or safe HTML/rendering. */
export function isArticleBody(value: unknown): value is ArticleBodyV1 {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    body.version === 1 &&
    body.format === "called-together.rich-text" &&
    body.content !== null &&
    typeof body.content === "object" &&
    !Array.isArray(body.content) &&
    isJson(value)
  );
}
