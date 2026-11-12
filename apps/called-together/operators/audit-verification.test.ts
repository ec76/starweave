import { describe, it, expect } from "vitest";
import {
  requiredAuditEvents,
  verifyAuditEvents,
} from "./audit-verification.ts";
interface Event {
  id: string;
  eventType: string;
  actingAccountId: string | null;
  targetAccountId: string | null;
  occurredAt: number;
}
const event = (type: string, i: number, account = "old"): Event => ({
  id: "fixture-" + i,
  eventType: type,
  actingAccountId: account,
  targetAccountId: account,
  occurredAt: i,
});
function api(events: Event[]) {
  const paths: string[] = [];
  return {
    paths,
    request: async (path: string) => {
      paths.push(path);
      const url = new URL(path, "https://fixture.invalid"),
        p = url.searchParams;
      const filtered = events
        .filter(
          (e) =>
            (!p.get("event") || e.eventType === p.get("event")) &&
            (!p.get("account") ||
              e.actingAccountId === p.get("account") ||
              e.targetAccountId === p.get("account")),
        )
        .sort((a, b) => b.occurredAt - a.occurredAt);
      const start = (Number(p.get("page") ?? 1) - 1) * 50;
      return {
        status: 200,
        json: () => ({
          events: filtered.slice(start, start + 50),
          hasMore: filtered.length > start + 50,
        }),
      };
    },
  };
}
describe("actual final audit assertion selection without SQL", () => {
  it("reproduces the old first-page false failure with several prior pages, then verifies every required type", async () => {
    const events = [
      ...requiredAuditEvents.map((t, i) => event(t, i)),
      ...Array.from({ length: 170 }, (_, i) => event("login", 100 + i)),
    ];
    const transport = api(events);
    const first = (await transport.request("/api/admin/activity")).json();
    expect(first.events).toHaveLength(50);
    expect(
      first.events.some((e) => e.eventType === "account_bootstrapped"),
    ).toBe(false);
    const summaries = await verifyAuditEvents(transport.request);
    expect(summaries).toHaveLength(requiredAuditEvents.length);
    expect(summaries.every((s) => s.observed >= s.expectedMinimum)).toBe(true);
    expect(
      transport.paths
        .slice(1)
        .every((p) =>
          new URL(p, "https://fixture.invalid").searchParams.has("event"),
        ),
    ).toBe(true);
  });
  it("paginates matching filters and requires target attribution, not merely the acting account", async () => {
    const scope = {
      created: "new-created",
      changed: "new-changed",
      survivor: "new-survivor",
    };
    const events = requiredAuditEvents.map((type, i) =>
      event(
        type,
        i,
        ["role_revoked", "account_enabled", "account_disabled"].includes(type)
          ? scope.changed
          : ["login", "logout"].includes(type)
            ? scope.survivor
            : scope.created,
      ),
    );
    // These match the API account OR filter through actingAccountId only and
    // must not satisfy the expected target. The real target is on page four.
    events.push(
      ...Array.from({ length: 160 }, (_, i) => ({
        ...event("account_created", 100 + i, "other"),
        actingAccountId: scope.created,
      })),
    );
    const summaries = await verifyAuditEvents(api(events).request, scope);
    expect(
      summaries.find((s) => s.assertion === "audit_event_account_created"),
    ).toMatchObject({ observed: 1, pages: 4 });
  });
  it("reports a genuinely absent visible event with safe counts after exhausting pages", async () => {
    const events = requiredAuditEvents
      .filter((t) => t !== "account_bootstrapped")
      .map((t, i) => event(t, i));
    await expect(verifyAuditEvents(api(events).request)).rejects.toMatchObject({
      assertion: "audit_event_account_bootstrapped",
      expected: 1,
      observed: 0,
      pages: 1,
    });
  });
  it("does not let prior-run events satisfy a full-run account-scoped assertion", async () => {
    const events = requiredAuditEvents.map((t, i) => event(t, i, "old"));
    await expect(
      verifyAuditEvents(api(events).request, {
        created: "new",
        changed: "new",
        survivor: "new",
      }),
    ).rejects.toMatchObject({
      assertion: "audit_event_account_created",
      expected: 1,
      observed: 0,
    });
  });
  it("distinguishes pagination overlap from a missing emitted event", async () => {
    const events = Array.from({ length: 50 }, (_, i) => ({
      ...event("account_created", i, "other"),
      actingAccountId: "created",
    }));
    const request = async () => ({
      status: 200,
      json: () => ({ events, hasMore: true }),
    });
    await expect(
      verifyAuditEvents(request, {
        created: "created",
        changed: "changed",
        survivor: "survivor",
      }),
    ).rejects.toMatchObject({
      assertion: "audit_pagination_overlap",
      expected: 0,
      observed: 1,
      pages: 2,
    });
  });
  it("requires successful HTTP status even when a body contains events", async () => {
    await expect(
      verifyAuditEvents(async () => ({
        status: 503,
        json: () => ({ events: [], hasMore: false }),
      })),
    ).rejects.toMatchObject({
      assertion: "audit_response_status",
      expected: 200,
      observed: 503,
    });
  });
});
