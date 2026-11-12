import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
import sql from "mssql";
import { database } from "./database.ts";
import { configuredDelivery } from "./admin/delivery.ts";
import { deliverAccountNotifications } from "./admin/notifications.ts";
import { adminConfig } from "./admin/config.ts";
import { withAuthDiagnostics } from "./admin/diagnostics.ts";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { authOptions } from "./admin/auth.ts";

const recipient = "fixture@example.invalid";
const notice = {
  email: recipient,
  notificationId: "11111111-1111-4111-8111-111111111111",
};
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "resend");
  vi.stubEnv("RESEND_API_KEY", "fictional-test-key");
  vi.stubEnv("AUTH_EMAIL_FROM_ADDRESS", "onboarding@resend.dev");
  vi.stubEnv("AUTH_EMAIL_FROM_NAME", "Called Together");
  vi.stubEnv("AUTH_EMAIL_RECIPIENT_ALLOWLIST", recipient);
  vi.stubEnv("ADMIN_AUTH_ENABLED", "");
  vi.stubEnv("ADMIN_AUTH_OWNER_VERIFIED", "");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(["setup", "reset"] as const)(
  "connects the installed Better Auth %s OTP hook to the selected provider",
  async (purpose) => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const store = {
      AuthUsers: [
        {
          id: notice.notificationId,
          email: recipient,
          name: "Fixture",
          emailVerified: true,
          disabled: false,
          actorId: notice.notificationId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      AuthAccounts: [],
      AuthSessions: [],
      AuthVerifications: [],
      AuthSetupVerifications: [],
    };
    const auth = betterAuth({
      ...authOptions(
        {
          beginSession: async () => {},
          recordSessionEvent: async () => {},
          completePassword: async () => {},
          delivery: configuredDelivery,
        },
        purpose,
      ),
      database: memoryAdapter(store),
    });
    const response = await auth.handler(
      new Request(
        "https://localhost:3001/api/auth/email-otp/request-password-reset",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://localhost:3001",
          },
          body: JSON.stringify({ email: recipient }),
        },
      ),
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const payload = JSON.parse(
      String(
        (fetch.mock.calls as unknown as [string, RequestInit][])[0]![1].body,
      ),
    );
    expect(payload.to).toEqual([recipient]);
    expect(payload.subject).toBe(
      purpose === "setup" ? "Set up your account" : "Reset your password",
    );
    expect(payload.text).toMatch(
      new RegExp("Your " + purpose + " code is [0-9]{8}\\."),
    );
  },
);

it("aborts a stalled provider request after five seconds and makes no automatic retry", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(new Error("private-timeout")),
          { once: true },
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  // Use a timer-backed signal because native AbortSignal.timeout uses real time.
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
  const failure = configuredDelivery
    .accountCreated(notice)
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(5000);
  expect(await failure).toMatchObject({
    name: "EmailDeliveryError",
    message: "Email delivery unavailable.",
  });
  expect(fetch).toHaveBeenCalledOnce();
});

it("sends shared templates to the intended recipient with bounded timeout, no redirects and stable outbox idempotency", async () => {
  const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  await configuredDelivery.accountCreated(notice);
  await configuredDelivery.accountCreated(notice);
  await configuredDelivery.sendCode({
    email: recipient,
    purpose: "reset",
    code: "12345678",
  });
  const calls = fetch.mock.calls as unknown as [string, RequestInit][];
  expect(calls.every(([url]) => url === "https://api.resend.com/emails")).toBe(
    true,
  );
  const request = calls[0]![1];
  expect(request.redirect).toBe("error");
  expect(timeout).toHaveBeenCalledWith(5000);
  expect(JSON.parse(String(request.body))).toEqual({
    from: "Called Together <onboarding@resend.dev>",
    to: [recipient],
    subject: "Your Called Together account was created",
    text: "An administrator created your account. Request your own setup code at https://localhost:3001/admin/setup\nThis link contains no credential.",
  });
  const headers = calls.map(([, init]) => new Headers(init.headers));
  expect(headers[0]!.get("authorization")).toBe("Bearer fictional-test-key");
  expect(headers[0]!.get("Idempotency-Key")).toBe(
    headers[1]!.get("Idempotency-Key"),
  );
  expect(headers[2]!.get("Idempotency-Key")).not.toBe(
    headers[0]!.get("Idempotency-Key"),
  );
  expect(JSON.parse(String(calls[2]![1].body)).text).toContain(
    "Your reset code is 12345678",
  );
});
it("rejects disallowed recipients and malformed configuration before fetch, never redirects", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    configuredDelivery.accountCreated({ email: "other@example.invalid" }),
  ).rejects.toThrow("Email delivery unavailable.");
  for (const [name, value] of [
    ["AUTH_EMAIL_RECIPIENT_ALLOWLIST", ""],
    ["AUTH_EMAIL_FROM_NAME", "Injected\nHeader"],
    ["RESEND_API_KEY", ""],
  ]) {
    const old = process.env[name!];
    vi.stubEnv(name!, value!);
    expect(() => adminConfig()).toThrow();
    vi.stubEnv(name!, old);
  }
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps deployed authentication closed until both explicit gates are set; custom domain needs only configuration", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("WEBSITE_SITE_NAME", "fixture-app");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://accounts.example.invalid");
  expect(() => adminConfig()).toThrow();
  vi.stubEnv("ADMIN_AUTH_ENABLED", "1");
  expect(() => adminConfig()).toThrow();
  vi.stubEnv("ADMIN_AUTH_OWNER_VERIFIED", "1");
  expect(adminConfig().origin).toBe("https://accounts.example.invalid");
  vi.stubEnv("AUTH_EMAIL_FROM_ADDRESS", "accounts@example.invalid");
  expect(adminConfig().origin).toBe("https://accounts.example.invalid");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  expect(() => adminConfig()).toThrow();
});
it.each([400, 401, 403, 409, 429, 500])(
  "does not retry provider rejection %s or disclose provider errors",
  async (status) => {
    const fetch = vi.fn(
      async () => new Response("private-provider-payload", { status }),
    );
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("AUTH_DEBUG", "1");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      withAuthDiagnostics(() => configuredDelivery.accountCreated(notice)),
    ).rejects.toThrow("Email delivery unavailable.");
    expect(fetch).toHaveBeenCalledOnce();
    const output = JSON.stringify(log.mock.calls);
    for (const sensitive of [
      recipient,
      "fictional-test-key",
      "private-provider-payload",
      notice.notificationId,
    ])
      expect(output).not.toContain(sensitive);
    expect(output).toContain("email_delivery_unavailable");
  },
);
it("sanitizes timeout/network failures without retrying or retaining a cause", async () => {
  const fetch = vi.fn(async () => {
    throw new Error("private-network-error");
  });
  vi.stubGlobal("fetch", fetch);
  const failure = await configuredDelivery
    .accountCreated(notice)
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({ message: "Email delivery unavailable." });
  expect(failure).not.toHaveProperty("cause");
  expect(fetch).toHaveBeenCalledOnce();
});
it("uses the actual outbox path: failed acceptance leaves pending, retry reuses key, acceptance precedes DeliveredAt", async () => {
  const query = vi.fn().mockResolvedValue({
    recordset: [{ UserId: notice.notificationId, email: recipient }],
  } as never);
  vi.mocked(database.getPool).mockResolvedValue({
    request: () => {
      const request = new sql.Request();
      request.query = query as typeof request.query;
      return request;
    },
  } as sql.ConnectionPool);
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("private"))
    .mockResolvedValueOnce(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await expect(deliverAccountNotifications()).rejects.toThrow(
    "Email delivery unavailable.",
  );
  expect(query).toHaveBeenCalledTimes(1);
  await deliverAccountNotifications();
  expect(query).toHaveBeenCalledTimes(3);
  expect(String(query.mock.calls[2]![0])).toContain(
    "UPDATE dbo.AuthNotifications",
  );
  expect(
    new Headers(fetch.mock.calls[0]![1].headers).get("Idempotency-Key"),
  ).toBe(new Headers(fetch.mock.calls[1]![1].headers).get("Idempotency-Key"));
});
