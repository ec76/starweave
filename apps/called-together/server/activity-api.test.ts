import { afterEach, beforeEach, it, expect, vi } from "vitest";
import sql from "mssql";
vi.mock("server-only", () => ({}));
vi.mock("./admin/access", () => ({ requestAdminSession: vi.fn() }));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
import { requestAdminSession } from "./admin/access";
import { database } from "./database.ts";
import { GET } from "../app/api/admin/activity/route";
import type { AdminSession } from "../domain/admin-auth";
let request: sql.Request;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_DEBUG", "");
  vi.mocked(requestAdminSession).mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    roles: ["Administrator"],
  } as unknown as AdminSession);
  request = new sql.Request();
  vi.mocked(database.getPool).mockResolvedValue({
    request: () => request,
  } as sql.ConnectionPool);
  vi.spyOn(request, "execute").mockResolvedValue({
    recordset: Array.from({ length: 51 }, (_, i) => ({
      id: String(i),
      occurredAt: new Date("2026-11-11T12:00:00.000Z"),
      eventType: "login",
      outcome: "success",
      actorKind: "account",
      attempts: 1,
      password: "PRIVATE_SENTINEL",
    })),
  } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.each([{ roles: null }, { roles: ["Writer"] }, { roles: ["Approver"] }])(
  "keeps activity private before touching its SQL procedure (%j)",
  async ({ roles }) => {
    vi.mocked(requestAdminSession).mockResolvedValue(
      roles ? ({ id: "fixture", roles } as unknown as AdminSession) : null,
    );
    const response = await GET(
      new Request("https://localhost:3001/api/admin/activity"),
    );
    expect([401, 403].includes(response.status)).toBe(true);
    expect(database.getPool).not.toHaveBeenCalled();
  },
);
it("uses the narrow authorized procedure with bounded page size and typed filters", async () => {
  const response = await GET(
    new Request(
      "https://localhost:3001/api/admin/activity?page=2&event=login&from=2026-11-01&until=2026-11-12",
    ),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.events.length).toBe(50);
  expect(body.hasMore).toBe(true);
  expect(JSON.stringify(body).includes("PRIVATE_SENTINEL")).toBe(false);
  expect(request.execute).toHaveBeenCalledExactlyOnceWith(
    "dbo.AuthListActivity",
  );
  expect(
    request.parameters.Page!.type === sql.Int &&
      request.parameters.Page!.value === 2,
  ).toBe(true);
  expect(
    request.parameters.From!.type === sql.DateTime2 &&
      request.parameters.From!.value instanceof Date,
  ).toBe(true);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it.each(["?page=0", "?event=unknown", "?from=0000-01-01", "?page=1&page=2"])(
  "rejects invalid filters %s before SQL",
  async (query) => {
    expect(
      (
        await GET(
          new Request("https://localhost:3001/api/admin/activity" + query),
        )
      ).status,
    ).toBe(400);
    expect(database.getPool).not.toHaveBeenCalled();
  },
);
