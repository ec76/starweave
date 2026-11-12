import { Connection, Request as DriverRequest, TYPES } from "tedious";
import { EventEmitter } from "node:events";
import { sessionCookieName } from "./admin/session-cookie.ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sql from "mssql";
const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  getSession: vi.fn(),
  redirect: vi.fn((_: string): never => {
    throw new Error("TEST_REDIRECT");
  }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("./admin/auth", () => ({
  auth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
vi.mock("../app/admin/admin-views", () => ({
  AdminLanding: () => null,
  AdminAccessDenied: () => null,
  AdminUnavailable: () => null,
}));
vi.mock("../app/admin/auth-controls", () => ({
  AuthControls: () => null,
  AccountControls: () => null,
}));
import AdminPage from "../app/admin/page";
import {
  AdminLanding,
  AdminUnavailable,
  AdminAccessDenied,
} from "../app/admin/admin-views";
import { database } from "./database.ts";
import {
  authSessionDiagnostic,
  withAuthDiagnostics,
} from "./admin/diagnostics.ts";

const privateText = "PRIVATE_SENTINEL";
let fail = "";
let live = true;
let authorized = true;
let roles: string[];
let log: ReturnType<typeof vi.spyOn>;
let query: ReturnType<typeof vi.spyOn>;
function events() {
  return log.mock.calls.map((args: unknown[]) =>
    JSON.parse(String(args[0]).replace("[called-together:auth-debug] ", "")),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  fail = "";
  live = true;
  authorized = true;
  roles = ["Administrator"];
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "1");
  vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
  vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
  vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  mocks.headers.mockResolvedValue(
    new Headers({ cookie: sessionCookieName + "=" + privateText }),
  );
  mocks.getSession.mockResolvedValue({ session: { id: privateText } });
  vi.mocked(database.getPool).mockImplementation(async () => {
    if (fail === "mssql_pool")
      throw Object.assign(new Error(privateText), { code: "ELOGIN" });
    return { request: () => new sql.Request() } as sql.ConnectionPool;
  });
  log = vi.spyOn(console, "info").mockImplementation(() => {});
  query = vi
    .spyOn(sql.Request.prototype, "query")
    .mockImplementation(async function (this: sql.Request, text: string) {
      const validator = new DriverRequest("", () => {});
      for (const parameter of Object.values(this.parameters)) {
        expect(parameter.type === sql.NVarChar).toBe(true);
        validator.addParameter(
          parameter.name,
          TYPES.NVarChar,
          parameter.value,
          { length: parameter.length },
        );
      }
      validator.validateParameters(
        undefined,
        {} as Parameters<DriverRequest["validateParameters"]>[1],
      );
      const operation = text.includes("TOP (100)")
        ? "admin_account_list"
        : text.includes("u.actorId")
          ? "session_account_invitation"
          : text.includes("SELECT r.Role")
            ? "session_roles"
            : "session_liveness";
      if (fail === operation)
        throw {
          cause: {
            code: "EREQUEST",
            originalError: { info: { number: 229, message: privateText } },
          },
          parameters: privateText,
        };
      if (operation === "session_liveness")
        return { recordset: live ? [{ id: privateText }] : [] };
      if (operation === "session_account_invitation")
        return {
          recordset: authorized
            ? [
                {
                  id: privateText,
                  userId: privateText,
                  actorId: privateText,
                  name: privateText,
                  email: privateText,
                  expiresAt: new Date(Date.now() + 60000),
                },
              ]
            : [],
        };
      if (operation === "session_roles")
        return {
          recordset:
            fail === "session_mapping" ? null : roles.map((Role) => ({ Role })),
        };
      return {
        recordset: [
          {
            id: privateText,
            name: privateText,
            email: privateText,
            disabled: false,
            roles:
              fail === "admin_account_mapping"
                ? privateText
                : '[{"Role":"Administrator"}]',
          },
        ],
      };
    } as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("GET /admin actual session and account repository diagnostics", () => {
  it.each([
    "session_liveness",
    "session_account_invitation",
    "session_roles",
    "admin_account_list",
  ])(
    "identifies %s SQL failure at the unavailable catch",
    async (operation) => {
      fail = operation;
      expect((await AdminPage()).type).toBe(AdminUnavailable);
      expect(events()).toContainEqual({
        stage: "query",
        operation,
        outcome: "failed",
        reason: "sql_permission_denied",
        sqlNumber: 229,
      });
      expect(events()).toContainEqual({
        stage: "admin_page",
        operation: "admin_page",
        outcome: "failed",
        reason: "sql_permission_denied",
        sqlNumber: 229,
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );
  it.each([
    "page_headers",
    "session_lookup",
    "mssql_pool",
    "session_mapping",
    "admin_account_mapping",
  ])("separates %s from a SQL query failure", async (operation) => {
    fail = operation;
    if (operation === "page_headers")
      mocks.headers.mockRejectedValueOnce(new TypeError(privateText));
    if (operation === "session_lookup")
      mocks.getSession.mockRejectedValueOnce(new TypeError(privateText));
    expect((await AdminPage()).type).toBe(AdminUnavailable);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation, outcome: "failed" }),
      ]),
    );
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation,
          outcome: "failed",
          reason:
            operation === "mssql_pool"
              ? "sql_authentication"
              : operation === "admin_account_mapping"
                ? "syntax_error"
                : "type_error",
        }),
      ]),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
  });
  it("rejects a non-string library session ID through the installed validator without coercion", async () => {
    mocks.getSession.mockResolvedValue({
      session: { id: { private: privateText } },
    });
    expect((await AdminPage()).type).toBe(AdminUnavailable);
    expect(events()).toContainEqual(
      expect.objectContaining({
        operation: "session_binding",
        parameter: "id",
        expectedType: "nvarchar(36)",
        actualType: "object",
        actualLength: null,
        category: "invalid_string",
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
  });
  it.each([false, true])(
    "runs the actual page service through installed mssql/Tedious validation, invalid=%s",
    async (invalid) => {
      query.mockRestore();
      const id = "00000000-0000-4000-8000-000000000001";
      mocks.getSession.mockResolvedValue({
        session: { id: invalid ? { private: privateText } : id },
      });
      let validated = 0;
      const connection = Object.assign(new EventEmitter(), {
        databaseCollation: undefined,
        config: { options: {} },
        debug: { log: () => {} },
        currentTransactionDescriptor: () => Buffer.alloc(8),
        resolveRequestParameter: Connection.prototype.resolveRequestParameter,
        execSql: Connection.prototype.execSql,
        makeRequest(request: DriverRequest) {
          validated++;
          const binding = request.parameters.find((p) => p.name === "id");
          if (binding) {
            expect(binding.type === TYPES.NVarChar).toBe(true);
            expect(binding.length).toBe(36);
            expect(typeof binding.value).toBe("string");
            expect((binding.value as string).length).toBe(36);
          }
          const text = request.sqlTextOrProcedure ?? "";
          const row = text.includes("TOP (100)")
            ? null
            : text.includes("u.actorId")
              ? {
                  id,
                  userId: id,
                  actorId: id,
                  email: privateText,
                  name: privateText,
                  expiresAt: new Date(Date.now() + 60000).toISOString(),
                }
              : text.includes("SELECT r.Role")
                ? { Role: "Administrator" }
                : { id };
          const metadata = Object.keys(row ?? { id }).map((colName) => ({
            colName,
            type: TYPES.NVarChar,
            flags: 1,
          }));
          (request as EventEmitter).emit("columnMetadata", metadata);
          if (row)
            request.emit(
              "row",
              metadata.map((m) => ({
                metadata: m,
                value: row[m.colName as keyof typeof row],
              })),
            );
          request.emit("doneInProc", row ? 1 : 0, false);
          (request as unknown as { callback: (error: null) => void }).callback(
            null,
          );
        },
      });
      const parent = {
        connected: true,
        config: {},
        request() {
          return new sql.Request(this as unknown as sql.ConnectionPool);
        },
        acquire(_request: unknown, callback: (...args: unknown[]) => void) {
          callback(null, connection, {});
        },
        release: vi.fn(),
      };
      vi.mocked(database.getPool).mockResolvedValue(
        parent as unknown as sql.ConnectionPool,
      );
      const page = await AdminPage();
      if (invalid) {
        expect(page.type).toBe(AdminUnavailable);
        expect(validated).toBe(0);
        expect(events()).toContainEqual(
          expect.objectContaining({
            operation: "session_binding",
            failedParameter: "id",
            actualType: "object",
            category: "invalid_string",
          }),
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
        return;
      }
      expect(
        events().filter((e: { outcome?: string }) => e.outcome === "failed"),
      ).toEqual([]);
      expect(page.type).toBe(AdminLanding);
      const { sessionApi } = await import("./admin/session-api.ts");
      expect(
        (
          await sessionApi()(
            new Request("https://localhost/api/admin/session", {
              headers: await mocks.headers(),
            }),
          )
        ).status,
      ).toBe(200);
      expect(validated).toBe(7);
      expect(parent.release).toHaveBeenCalledTimes(7);
      expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
    },
  );
  it("reaches the Administrator page only after library, SQL gate, roles and account list succeed", async () => {
    expect((await AdminPage()).type).toBe(AdminLanding);
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
    for (const fact of [
      { cookieHeaderPresent: true, sessionCookiePresent: true },
      { librarySessionFound: true },
      { sqlSessionLive: true },
      { accountInvitationAuthorized: true },
      { rolesPresent: true },
    ])
      expect(events()).toContainEqual({
        stage: "session",
        operation: "session_checks",
        ...fact,
      });
    const statements = query.mock.calls.map((args: unknown[]) =>
      String(args[0]),
    );
    expect(statements[1]).toContain("u.disabled = 0");
    expect(statements[1]).toContain("i.AcceptedAt IS NOT NULL");
    expect(statements[1]).toContain("s.expiresAt > SYSUTCDATETIME()");
    expect(
      statements.every((text: string) => !text.includes(privateText)),
    ).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
  });
  it.each([
    "no_cookie",
    "unrelated_cookie",
    "no_library_session",
    "expired_sql_session",
    "account_invitation_rejected",
  ])("redirects without authorizing for %s", async (condition) => {
    if (condition === "no_cookie")
      mocks.headers.mockResolvedValue(new Headers());
    if (condition === "unrelated_cookie") {
      mocks.headers.mockResolvedValue(
        new Headers({ cookie: "unrelated=" + privateText }),
      );
      mocks.getSession.mockResolvedValue(null);
    }
    if (condition === "no_library_session")
      mocks.getSession.mockResolvedValue(null);
    if (condition === "expired_sql_session") live = false;
    if (condition === "account_invitation_rejected") authorized = false;
    await expect(AdminPage()).rejects.toThrow("TEST_REDIRECT");
    expect(mocks.redirect).toHaveBeenCalledWith("/admin/login?returnTo=/admin");
    expect(
      events().some(
        (e: { operation?: string; outcome?: string }) =>
          e.operation === "admin_page" && e.outcome === "failed",
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some((args: unknown[]) =>
        String(args[0]).includes("TOP (100)"),
      ),
    ).toBe(false);
    if (condition === "unrelated_cookie")
      expect(events()).toContainEqual({
        stage: "session",
        operation: "session_checks",
        cookieHeaderPresent: true,
        sessionCookiePresent: false,
      });
  });
  it.each([
    { assigned: [] },
    { assigned: ["Writer"] },
    { assigned: ["Administrator-like"] },
  ])(
    "does not query accounts without an actual Administrator role (%j)",
    async ({ assigned }) => {
      roles = assigned;
      expect((await AdminPage()).type).toBe(
        assigned.includes("Writer") ? AdminLanding : AdminAccessDenied,
      );
      expect(
        query.mock.calls.some((args: unknown[]) =>
          String(args[0]).includes("TOP (100)"),
        ),
      ).toBe(false);
    },
  );
  it.each(["disabled", "production", "azure"])(
    "does not log page/session diagnostics for %s",
    async (mode) => {
      if (mode === "disabled") vi.stubEnv("AUTH_DEBUG", "");
      if (mode === "production") vi.stubEnv("NODE_ENV", "production");
      if (mode === "azure") vi.stubEnv("WEBSITE_SITE_NAME", "private-site");
      await AdminPage();
      expect(log).not.toHaveBeenCalled();
    },
  );
  it("enumerates boolean facts without spreading extra data", async () => {
    await withAuthDiagnostics(async () =>
      authSessionDiagnostic({
        sessionCookiePresent: privateText,
        token: privateText,
      } as never),
    );
    expect(events()).toEqual([
      {
        stage: "session",
        operation: "session_checks",
        sessionCookiePresent: false,
      },
    ]);
  });
  it("identifies invalid configuration before session or SQL access", async () => {
    vi.stubEnv("ADMIN_AUTH_SECRET", privateText);
    expect((await AdminPage()).type).toBe(AdminUnavailable);
    expect(events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "admin_configuration",
          outcome: "failed",
        }),
      ]),
    );
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(database.getPool).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(privateText);
  });
});
