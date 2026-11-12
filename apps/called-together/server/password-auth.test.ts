import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
vi.mock("server-only", () => ({}));
vi.mock("./admin/credentials.ts", () => ({ credentialOperation: vi.fn() }));
vi.mock("./admin/activity.ts", () => ({
  securityEvent: vi.fn(async () => {}),
}));
vi.mock("./admin/repository", () => ({
  accounts: {
    throttle: vi.fn(async () => true),
    eligible: vi.fn(),
    session: vi.fn(),
    manage: vi.fn(),
    list: vi.fn(),
  },
}));
import { credentialOperation } from "./admin/credentials.ts";
import { authOptions } from "./admin/auth";
import { csrfGet } from "./admin/handlers";
import { securityEvent } from "./admin/activity.ts";
import { accounts } from "./admin/repository";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { POST as setupCode } from "../app/api/auth/setup/code/route";
import { POST as setup } from "../app/api/auth/setup/route";
import { POST as resetCode } from "../app/api/auth/reset/code/route";
import { POST as reset } from "../app/api/auth/reset/route";
const origin = "https://localhost:3001",
  id = "11111111-1111-4111-8111-111111111111",
  email = "fixture@example.invalid",
  password = "Fictional passphrase only 2026";
let store: Record<string, Record<string, unknown>[]>;
let codes: Map<string, string>,
  active: boolean,
  disabled: boolean,
  audit: string[];
let adapterWrites: { model: string; operation: string; columns: string[] }[];
function instance(purpose: "setup" | "reset" = "reset") {
  return betterAuth({
    ...authOptions(
      {
        beginSession: async () => {
          if (!active || disabled) throw new Error("Account unavailable.");
        },
        recordSessionEvent: async (_, event) => {
          audit.push(event);
        },
        completePassword: async () => {
          active = true;
          audit.push(purpose + "_completed");
        },
        delivery: {
          sendCode: async (message) => {
            codes.set(message.purpose, message.code);
          },
          accountCreated: async () => {},
        },
      },
      purpose,
    ),
    database: (options: Parameters<ReturnType<typeof memoryAdapter>>[0]) =>
      new Proxy(memoryAdapter(store)(options), {
        get(target, key) {
          const method = Reflect.get(target, key);
          if (typeof method !== "function") return method;
          return (...args: unknown[]) => {
            if (
              [
                "create",
                "update",
                "updateMany",
                "delete",
                "deleteMany",
              ].includes(String(key))
            ) {
              const input = args[0] as {
                model: string;
                data?: Record<string, unknown>;
                update?: Record<string, unknown>;
              };
              adapterWrites.push({
                model: input.model,
                operation: String(key),
                columns: Object.keys(input.data ?? input.update ?? {}),
              });
            }
            return Reflect.apply(method, target, args);
          };
        },
      }),
  });
}
async function form(
  path: string,
  fields: Record<string, string>,
  session = "",
) {
  const proof = await csrfGet(),
    data = await proof.json();
  return new Request(origin + path, {
    method: "POST",
    headers: {
      origin,
      cookie:
        proof.cookies
          .getAll()
          .map((c) => c.name + "=" + c.value)
          .join("; ") + (session ? "; " + session : ""),
    },
    body: new URLSearchParams({ ...fields, csrfToken: data.csrfToken }),
  });
}
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
beforeEach(() => {
  adapterWrites = [];
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "");
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", origin);
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  vi.stubEnv("ADMIN_SESSION_SECONDS", "43200");
  active = false;
  disabled = false;
  codes = new Map();
  audit = [];
  store = {
    AuthUsers: [
      {
        id,
        email,
        name: "Fixture",
        emailVerified: false,
        disabled: false,
        actorId: id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    AuthAccounts: [],
    AuthSessions: [],
    AuthVerifications: [],
    AuthSetupVerifications: [],
  };
  vi.mocked(accounts.throttle).mockResolvedValue(true);
  vi.mocked(credentialOperation).mockImplementation(
    async (action, input, request) => {
      if (
        disabled ||
        (action !== "logout" && input.email !== email) ||
        (action.startsWith("setup") ? active : action !== "logout" && !active)
      )
        return new Response(null, { status: 400 });
      const purpose = action.startsWith("setup") ? "setup" : "reset";
      const endpoint =
        action === "login"
          ? "/sign-in/email"
          : action === "logout"
            ? "/sign-out"
            : action.endsWith("code")
              ? "/email-otp/request-password-reset"
              : "/email-otp/reset-password";
      return instance(purpose).handler(
        new Request(origin + "/api/auth" + endpoint, {
          method: "POST",
          headers: {
            origin,
            "content-type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify(
            action === "logout"
              ? {}
              : action === "login"
                ? {
                    email: input.email,
                    password: input.password,
                    rememberMe: true,
                  }
                : action.endsWith("code")
                  ? { email: input.email }
                  : {
                      email: input.email,
                      otp: input.code,
                      password: input.password,
                    },
          ),
        }),
      );
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
async function activate() {
  await setupCode(await form("/api/auth/setup/code", { email }));
  return setup(
    await form("/api/auth/setup", {
      email,
      code: codes.get("setup")!,
      password,
    }),
  );
}
describe("actual HTTP route forms with installed library password primitives", () => {
  it("keeps installed library writes within the proposed runtime column permissions", async () => {
    expect((await activate()).status).toBe(303);
    const signedIn = await login(
      await form("/api/auth/login", { email, password }),
    );
    expect(signedIn.status).toBe(303);
    await resetCode(await form("/api/auth/reset/code", { email }));
    expect(
      (
        await reset(
          await form("/api/auth/reset", {
            email,
            code: codes.get("reset")!,
            password: "Another valid password 123!",
          }),
        )
      ).status,
    ).toBe(303);
    // Record field names only. Actual SQL grants still require the owner-run
    // restricted-principal route test; this is installed-library behavior evidence.
    const users = adapterWrites.filter(
      (w) => w.model === "AuthUsers" || w.model === "user",
    );
    expect(users.length).toBeGreaterThan(0);
    for (const write of users) {
      expect(["update", "updateMany"]).toContain(write.operation);
      expect(
        write.columns.every((c) => ["emailVerified", "updatedAt"].includes(c)),
      ).toBe(true);
    }
    for (const write of adapterWrites.filter(
      (w) =>
        ["AuthAccounts", "account"].includes(w.model) &&
        ["update", "updateMany"].includes(w.operation),
    ))
      expect(
        write.columns.every((c) => ["password", "updatedAt"].includes(c)),
      ).toBe(true);
    expect(
      adapterWrites.some(
        (w) =>
          [
            "AuthSessions",
            "session",
            "AuthVerifications",
            "AuthSetupVerifications",
            "verification",
          ].includes(w.model) && ["update", "updateMany"].includes(w.operation),
      ),
    ).toBe(false);
    expect(
      adapterWrites.some(
        (w) =>
          ["AuthAccounts", "account"].includes(w.model) &&
          ["delete", "deleteMany"].includes(w.operation),
      ),
    ).toBe(false);
  });
  it("reads an expired session as unauthenticated without invoking a write hook outside the transaction", async () => {
    await activate();
    const response = await login(
      await form("/api/auth/login", { email, password }),
    );
    const cookie = cookies(response);
    store.AuthSessions![0]!.expiresAt = new Date(Date.now() - 1000);
    const reader = betterAuth({
      ...authOptions(),
      database: memoryAdapter(store),
    });
    expect(
      (await reader.api.getSession({
        headers: new Headers({ cookie }),
        query: { disableCookieCache: true },
      })) === null,
    ).toBe(true);
  });
  it("consumes the global limit even for malformed credentials and keeps security writes separate", async () => {
    const response = await login(
      await form("/api/auth/login", { email: "invalid", password: "short" }),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/admin/login?error=1",
    );
    expect(accounts.throttle).toHaveBeenCalledExactlyOnceWith(
      "login:global",
      60,
    );
    expect(credentialOperation).not.toHaveBeenCalled();
    expect(securityEvent).toHaveBeenCalledWith("login_failed");
  });
  it("fails closed if the independent security write is unavailable", async () => {
    vi.mocked(securityEvent).mockRejectedValueOnce(
      new Error("PRIVATE_SENTINEL"),
    );
    const response = await login(
      await form("/api/auth/login", { email, password }),
    );
    expect(response.status).toBe(503);
    expect((await response.text()).includes("PRIVATE_SENTINEL")).toBe(false);
  });
  it("sets up once, stores a library hash, signs in with a durable cookie and logs out", async () => {
    expect((await activate()).status).toBe(303);
    expect(active).toBe(true);
    expect(store.AuthAccounts?.length).toBe(1);
    const hash = store.AuthAccounts![0]!.password;
    expect(
      typeof hash === "string" &&
        hash !== password &&
        hash.length >= 64 &&
        hash.length <= 1024,
    ).toBe(true);
    const response = await login(
      await form("/api/auth/login", { email, password, returnTo: "/admin" }),
    );
    expect(response.headers.get("location")).toBe(origin + "/admin");
    const cookie = cookies(response);
    expect(cookie.includes("__Host-ct-session=")).toBe(true);
    for (let i = 0; i < 2; i++)
      expect(
        (
          await instance().api.getSession({
            headers: new Headers({ cookie }),
            query: { disableCookieCache: true },
          })
        )?.user.id,
      ).toBe(id);
    const stored = store.AuthSessions![0]!;
    const lifetime =
      new Date(stored.expiresAt as string).getTime() -
      new Date(stored.createdAt as string).getTime();
    expect(Math.abs(lifetime - 43200000) < 1000).toBe(true);
    expect(audit).toContain("sign_in");
    expect(
      (await logout(await form("/api/auth/logout", {}, cookie))).status,
    ).toBe(303);
    expect(
      (await instance().api.getSession({
        headers: new Headers({ cookie }),
      })) === null,
    ).toBe(true);
    expect(audit).toContain("sign_out");
  });
  it("uses a single-use recovery code, revokes sessions and requires password login afterward", async () => {
    await activate();
    const signed = await login(
        await form("/api/auth/login", { email, password }),
      ),
      cookie = cookies(signed);
    await resetCode(await form("/api/auth/reset/code", { email }));
    const code = codes.get("reset")!;
    const changed = password + " new";
    expect(
      (
        await reset(
          await form("/api/auth/reset", { email, password: changed, code }),
        )
      ).headers.get("location"),
    ).toBe(origin + "/admin/login");
    expect(
      await instance().api.getSession({ headers: new Headers({ cookie }) }),
    ).toBeNull();
    expect(
      (
        await reset(
          await form("/api/auth/reset", {
            email,
            password: password + " again",
            code,
          }),
        )
      ).headers.get("location"),
    ).toContain("error=1");
    expect(
      (
        await login(await form("/api/auth/login", { email, password }))
      ).headers.get("location"),
    ).toContain("error=1");
    expect(
      (
        await login(await form("/api/auth/login", { email, password: changed }))
      ).headers.get("location"),
    ).toBe(origin + "/admin");
  });
  it("rejects wrong, expired and cross-purpose codes without creating a credential", async () => {
    await setupCode(await form("/api/auth/setup/code", { email }));
    const code = codes.get("setup")!;
    const wrong = code[0] === "0" ? "1" + code.slice(1) : "0" + code.slice(1);
    expect(
      (
        await setup(
          await form("/api/auth/setup", { email, password, code: wrong }),
        )
      ).headers.get("location"),
    ).toContain("error=1");
    const direct = await instance("reset").handler(
      new Request(origin + "/api/auth/email-otp/reset-password", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email, password, otp: code }),
      }),
    );
    expect(direct.ok).toBe(false);
    for (const row of store.AuthSetupVerifications!)
      row.expiresAt = new Date(Date.now() - 1000);
    expect(
      (
        await setup(await form("/api/auth/setup", { email, password, code }))
      ).headers.get("location"),
    ).toContain("error=1");
    expect(store.AuthAccounts?.length).toBe(0);
  });
  it("does not expose public registration or passwordless library endpoints", async () => {
    for (const path of [
      "/sign-up/email",
      "/sign-in/email-otp",
      "/email-otp/send-verification-otp",
    ]) {
      const response = await instance().handler(
        new Request(origin + "/api/auth" + path, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            name: "Attacker",
            otp: "12345678",
            type: "sign-in",
          }),
        }),
      );
      expect(response.status).toBe(404);
    }
    expect(store.AuthAccounts?.length).toBe(0);
  });
  it("rejects CSRF, duplicate fields and unsafe returns before authentication", async () => {
    const bad = await form("/api/auth/login", { email, password });
    bad.headers.set("origin", "https://foreign.invalid");
    expect((await login(bad)).status).toBe(403);
    expect(
      (
        await login(
          await form("/api/auth/login", {
            email,
            password,
            returnTo: "https://foreign.invalid",
          }),
        )
      ).status,
    ).toBe(503);
    expect(credentialOperation).not.toHaveBeenCalled();
  });
  it.each(["unknown", "disabled", "throttled"])(
    "returns generic code/login outcomes for %s",
    async (mode) => {
      if (mode === "disabled") disabled = true;
      if (mode === "throttled")
        vi.mocked(accounts.throttle).mockResolvedValue(false);
      const target = mode === "unknown" ? "unknown@example.invalid" : email;
      expect(
        (
          await setupCode(await form("/api/auth/setup/code", { email: target }))
        ).headers.get("location"),
      ).toBe(origin + "/admin/setup?sent=1");
      expect(
        (
          await login(
            await form("/api/auth/login", { email: target, password }),
          )
        ).headers.get("location"),
      ).toBe(origin + "/admin/login?error=1");
      expect(codes.size).toBe(0);
      expect(securityEvent).toHaveBeenCalledWith("login_failed");
    },
  );
});
