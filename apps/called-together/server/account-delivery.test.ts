import { beforeEach, afterEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
import sql from "mssql";
import { configuredDelivery } from "./admin/delivery.ts";
import { deliverAccountNotifications } from "./admin/notifications.ts";
import { database } from "./database.ts";
import { withAuthDiagnostics } from "./admin/diagnostics.ts";
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "1");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("delivers to loopback Mailpit, keeps the creation link credential-free, and never logs delivery contents", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {}),
    fetch = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetch);
  await withAuthDiagnostics(async () => {
    await configuredDelivery.accountCreated({
      email: "fixture@example.invalid",
    });
    await configuredDelivery.sendCode({
      email: "fixture@example.invalid",
      purpose: "setup",
      code: "12345678",
    });
  });
  const call = fetch.mock.calls as unknown as [string, { body: string }][];
  expect(
    call.every(([url]) => url === "http://127.0.0.1:8025/api/v1/send"),
  ).toBe(true);
  const notice = JSON.parse(call[0]![1].body);
  const urls = String(notice.Text).match(/https:\/\/\S+/g);
  expect(urls).toEqual(["https://localhost:3001/admin/setup"]);
  expect(log).toHaveBeenCalled();
  expect(
    JSON.stringify(log.mock.calls).includes("fixture@example.invalid"),
  ).toBe(false);
  expect(JSON.stringify(log.mock.calls).includes("12345678")).toBe(false);
});
it("refuses deployed delivery before fetch", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubEnv("NODE_ENV", "production");
  await expect(
    configuredDelivery.accountCreated({ email: "fixture@example.invalid" }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not mark an outbox notification delivered on failure, preserving it for retry", async () => {
  vi.stubEnv("AUTH_DEBUG", "");
  const request = new sql.Request();
  const query = vi.spyOn(request, "query").mockResolvedValue({
    recordset: [
      {
        UserId: "11111111-1111-4111-8111-111111111111",
        email: "fixture@example.invalid",
      },
    ],
  } as never);
  vi.mocked(database.getPool).mockResolvedValue({
    request: () => request,
  } as sql.ConnectionPool);
  const error = new Error("Synthetic delivery failure.");
  await expect(
    deliverAccountNotifications(
      {
        sendCode: async () => {},
        accountCreated: async () => {
          throw error;
        },
      },
      "fixture@example.invalid",
    ),
  ).rejects.toBe(error);
  expect(query).toHaveBeenCalledOnce();
  expect(String(query.mock.calls[0]![0]).includes("UPDATE")).toBe(false);
});
