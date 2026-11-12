import "server-only";
import sql from "mssql";
import { database } from "../database.ts";
import { accountId } from "../../domain/accounts.ts";
import {
  activityTypes,
  type ActivityFilter,
  type ActivityEvent,
  type SecurityEvent,
} from "../../domain/activity.ts";
import { authStage } from "./diagnostics.ts";
export async function securityEvent(event: SecurityEvent) {
  await authStage("query", "security_event", async () =>
    (await database.getPool())
      .request()
      .input("EventType", sql.VarChar(30), event)
      .execute("dbo.AuthSecurityEvent"),
  );
}
export function activityFilter(
  params: Record<string, string | string[] | undefined>,
): ActivityFilter {
  if (Object.values(params).some((value) => Array.isArray(value)))
    throw new Error("Repeated activity filters are not allowed.");
  const page = Number(params.page ?? "1");
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw new Error("Invalid activity page.");
  const account = params.account ? accountId(params.account) : undefined;
  const event = params.event;
  if (
    event &&
    (typeof event !== "string" ||
      ![
        ...activityTypes,
        "login_failed",
        "code_requested",
        "code_rejected",
        "reset_failed",
      ].includes(event))
  )
    throw new Error("Invalid activity event.");
  const date = (value: unknown) => {
    if (!value) return;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error("Invalid date.");
    const date = new Date(value + "T00:00:00.000Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.getUTCFullYear() < 1 ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error("Invalid date.");
    return date;
  };
  const from = date(params.from),
    until = date(params.until);
  if (from && until && from >= until) throw new Error("Invalid date range.");
  return {
    page,
    accountId: account,
    eventType: typeof event === "string" && event ? event : undefined,
    from,
    until,
  };
}
export async function listActivity(sessionId: string, filter: ActivityFilter) {
  return authStage("query", "activity_list", async () => {
    const result = await (
      await database.getPool()
    )
      .request()
      .input("SessionId", sql.NVarChar(36), sessionId)
      .input("Page", sql.Int, filter.page)
      .input("AccountId", sql.NVarChar(36), filter.accountId ?? null)
      .input("EventType", sql.VarChar(40), filter.eventType ?? null)
      .input("From", sql.DateTime2(3), filter.from ?? null)
      .input("Until", sql.DateTime2(3), filter.until ?? null)
      .execute("dbo.AuthListActivity");
    return {
      events: result.recordset.slice(0, 50).map((row) => ({
        id: row.id,
        eventType: row.eventType,
        outcome: row.outcome,
        actorKind: row.actorKind,
        actingAccountId: row.actingAccountId,
        targetAccountId: row.targetAccountId,
        articleId: row.articleId,
        revisionId: row.revisionId,
        role: row.role,
        reason: row.reason,
        correlationId: row.correlationId,
        attempts: row.attempts,
        occurredAt: new Date(row.occurredAt).toISOString(),
      })) as ActivityEvent[],
      hasMore: filter.page < 10000 && result.recordset.length > 50,
    };
  });
}
