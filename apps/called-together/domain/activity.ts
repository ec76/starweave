import type { AccountRole } from "./admin-auth";
export const activityTypes = [
  "account_created",
  "account_bootstrapped",
  "setup_completed",
  "role_granted",
  "role_revoked",
  "account_enabled",
  "account_disabled",
  "login",
  "logout",
  "sessions_revoked",
  "password_reset",
  "auth_cutover",
  "invitation_renewed",
  "article_created",
  "article_edited",
  "article_archived",
  "article_submitted",
  "changes_requested",
  "article_approved",
  "article_published",
  "article_unpublished",
] as const;
export type ActivityType = (typeof activityTypes)[number];
export type SecurityEvent =
  "login_failed" | "code_requested" | "code_rejected" | "reset_failed";
export interface ActivityEvent {
  id: string;
  occurredAt: string;
  eventType: ActivityType | SecurityEvent;
  outcome: "success" | "failure";
  actorKind: "account" | "system" | "operator";
  actingAccountId: string | null;
  targetAccountId: string | null;
  articleId: string | null;
  revisionId: string | null;
  role: AccountRole | null;
  reason: "completed" | "legacy" | "cutover" | "aggregate";
  correlationId: string;
  attempts: number;
}
/** Future editorial services must invoke this inside their business transaction.
 * Actor/revision IDs come from authorization and stored revisions, never form claims.
 * No editor mutation service is implemented today. Prefer article_archived to delete.
 */
export interface EditorialAudit<Transaction> {
  append(event: {
    transaction: Transaction;
    outcome: "success";
    eventType: Extract<ActivityType, `article_${string}`> | "changes_requested";
    actingAccountId: string;
    articleId: string;
    revisionId: string;
    correlationId: string;
  }): Promise<void>;
}
export interface ActivityFilter {
  page: number;
  accountId?: string;
  eventType?: string;
  from?: Date;
  until?: Date;
}
