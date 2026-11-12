export const requiredAuditEvents = [
  "account_created",
  "setup_completed",
  "login",
  "password_reset",
  "sessions_revoked",
  "role_granted",
  "role_revoked",
  "account_enabled",
  "account_bootstrapped",
  "logout",
  "login_failed",
  "reset_failed",
  "code_requested",
  "code_rejected",
  "account_disabled",
] as const;
type Request = (
  path: string,
) => Promise<{ status: number; json: () => unknown }>;
export class AuditAssertionFailure extends Error {
  constructor(
    readonly assertion: string,
    readonly expected: number,
    readonly observed: number,
    readonly pages: number,
  ) {
    super("Audit verification assertion failed.");
  }
}
interface Scope {
  created: string;
  changed: string;
  survivor: string;
}
/** Use only the authorized API. Never print event rows, URLs or account IDs. */
export async function verifyAuditEvents(request: Request, scope?: Scope) {
  const summaries = [];
  for (const type of requiredAuditEvents) {
    const account = !scope
      ? undefined
      : [
            "account_created",
            "setup_completed",
            "password_reset",
            "sessions_revoked",
            "role_granted",
          ].includes(type)
        ? scope.created
        : ["role_revoked", "account_enabled", "account_disabled"].includes(type)
          ? scope.changed
          : ["login", "logout"].includes(type)
            ? scope.survivor
            : undefined;
    const assertion = "audit_event_" + type;
    let observed = 0,
      pages = 0;
    const seen = new Set<string>();
    for (let page = 1; page <= 10000; page++) {
      const query = new URLSearchParams({ event: type, page: String(page) });
      if (account) query.set("account", account);
      const response = await request("/api/admin/activity?" + query);
      pages++;
      if (response.status !== 200)
        throw new AuditAssertionFailure(
          "audit_response_status",
          200,
          response.status,
          pages,
        );
      let body: { events?: unknown; hasMore?: unknown };
      try {
        body = response.json() as typeof body;
      } catch {
        throw new AuditAssertionFailure("audit_page_json", 1, 0, pages);
      }
      if (
        !body ||
        !Array.isArray(body.events) ||
        typeof body.hasMore !== "boolean" ||
        body.events.length > 50
      )
        throw new AuditAssertionFailure("audit_page_shape", 1, 0, pages);
      for (const event of body.events as Record<string, unknown>[]) {
        if (
          !event ||
          typeof event !== "object" ||
          event.eventType !== type ||
          typeof event.id !== "string"
        )
          throw new AuditAssertionFailure("audit_event_filter", 1, 0, pages);
        if (seen.has(event.id))
          throw new AuditAssertionFailure(
            "audit_pagination_overlap",
            0,
            1,
            pages,
          );
        seen.add(event.id);
        const attributed =
          !account ||
          (type === "login" || type === "logout"
            ? event.actingAccountId === account &&
              event.targetAccountId === account
            : event.targetAccountId === account);
        if (attributed) observed++;
      }
      if (observed > 0) break;
      if (page === 10000 && body.events.length === 50)
        throw new AuditAssertionFailure(
          "audit_pagination_incomplete",
          1,
          0,
          pages,
        );
      if (!body.hasMore)
        throw new AuditAssertionFailure(assertion, 1, observed, pages);
      if (body.events.length === 0 || page === 10000)
        throw new AuditAssertionFailure(
          "audit_pagination_incomplete",
          1,
          0,
          pages,
        );
    }
    summaries.push({ assertion, expectedMinimum: 1, observed, pages });
  }
  return summaries;
}
