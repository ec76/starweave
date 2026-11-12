import { readFile } from "node:fs/promises";
import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  authSqlArguments,
  run,
  prepareVerifierAccount,
  verifyAuthenticatedAdmin,
} from "./verify-auth-sql.ts";
import { bootstrapArguments } from "./bootstrap-admin.ts";
import { loadMigrations, pendingMigrations } from "./migrations.ts";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("password migration and owner-only boundaries", () => {
  it("refuses audit-only continuation that could replay first-time setup or skip the audit assertions", () => {
    const env = {
      SQL_DATABASE: "ct_password_auth_test",
      AUTH_VERIFY_AUDIT_ONLY: "1",
    };
    expect(() =>
      authSqlArguments(["--database", "ct_password_auth_test"], env),
    ).toThrow();
    expect(() =>
      authSqlArguments(["--database", "ct_password_auth_test"], {
        ...env,
        AUTH_VERIFY_CONTINUE_ACTIVE: "1",
        AUTH_VERIFY_ADMIN_PAGE_ONLY: "1",
      }),
    ).toThrow();
    expect(
      authSqlArguments(["--database", "ct_password_auth_test"], {
        ...env,
        AUTH_VERIFY_CONTINUE_ACTIVE: "1",
      }).run,
    ).toBe(false);
  });
  it("reports the authenticated admin page substep when a 200 page renders unavailable", async () => {
    const request = vi.fn(async (path: string) => ({
      status: 200,
      text:
        path === "/admin" ? "Admin sign-in is temporarily unavailable." : "",
    }));
    const stage = vi.fn();
    await expect(
      verifyAuthenticatedAdmin(request, stage),
    ).rejects.toMatchObject({ operation: "authenticated_admin_page" });
    expect(request.mock.calls).toEqual([["/api/admin/session"], ["/admin"]]);
    expect(stage.mock.calls).toEqual([
      ["authenticated_session_api"],
      ["authenticated_admin_page"],
    ]);
  });
  it("distinguishes session API rejection from the admin page substep", async () => {
    const request = vi.fn(async () => ({ status: 401, text: "" }));
    await expect(
      verifyAuthenticatedAdmin(request, () => {}),
    ).rejects.toMatchObject({ operation: "authenticated_session_api" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    "uses ordinary code verification for account continuation=%s",
    async (continuing) => {
      const post = vi.fn(async () => ({ location: "/admin" }));
      const code = vi.fn(async () => "fixture-code");
      await prepareVerifierAccount(
        post,
        code,
        "fixture@example.invalid",
        "fixture-password",
        continuing,
      );
      const purpose = continuing ? "reset" : "setup";
      expect(post.mock.calls).toEqual([
        [
          "/api/auth/" + purpose + "/code",
          { email: "fixture@example.invalid" },
        ],
        [
          "/api/auth/" + purpose,
          {
            email: "fixture@example.invalid",
            code: "fixture-code",
            password: "fixture-password",
          },
        ],
      ]);
      expect(code).toHaveBeenCalledWith("fixture@example.invalid", purpose);
    },
  );
  it("validates all migration history without changing 0001-0005", async () => {
    const files = await loadMigrations("database/migrations");
    expect(files.map((f) => f.version)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      pendingMigrations(files, files.slice(0, 5)).map((f) => f.version),
    ).toEqual([6, 7]);
    const schema = files[5]!.sql,
      ops = files[6]!.sql;
    expect(schema).toContain("DROP CONSTRAINT CK_AuthAccounts_NoCredentials");
    expect(schema).toContain("DELETE dbo.AuthSessions");
    expect(ops).toContain("IF EXISTS(SELECT 1 FROM dbo.AuthUsers)");
    expect(ops).toContain("sp_getapplock");
    expect(ops).toContain("u.activatedAt IS NOT NULL AND u.emailVerified=1");
    expect(ops).toContain("@@TRANCOUNT=0");
    expect(schema).toContain("INSTEAD OF UPDATE, DELETE");
    // Never discard checksum mismatch safeguards during the cutover.
    expect(() =>
      pendingMigrations(files, [{ ...files[0]!, checksum: "edited" }]),
    ).toThrow();
  });
  it("dry-run cannot access SQL, HTTPS or Mailpit", async () => {
    vi.stubEnv("SQL_DATABASE", "ct_password_auth_test");
    vi.stubEnv("WEBSITE_INSTANCE_ID", "");
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(["--database", "ct_password_auth_test"]);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    for (const target of [
      "sqldb-called-together-dev",
      "master",
      "ct_password_auth_test;DROP",
    ])
      expect(() =>
        authSqlArguments(["--database", target, "--run"], process.env),
      ).toThrow();
    expect(() =>
      authSqlArguments(
        ["--database", "ct_other_auth_test", "--run"],
        process.env,
      ),
    ).toThrow();
  });
  it("requires explicit operator bootstrap intent and has no default password", () => {
    expect(
      bootstrapArguments([
        "--email",
        "fixture@example.invalid",
        "--name",
        "Fixture",
      ]).apply,
    ).toBe(false);
    expect(
      bootstrapArguments([
        "--email",
        "fixture@example.invalid",
        "--name",
        "Fixture",
        "--apply",
      ]).apply,
    ).toBe(true);
    expect(() => bootstrapArguments(["--password", "default"])).toThrow();
  });
  it("keeps private audit rows outside public SQL DTO sources", async () => {
    const source = await readFile("server/public-article-query.ts", "utf8");
    expect(source).not.toMatch(
      /ActivityEvents|AuthSecurityBuckets|AuthAuditEvents/,
    );
  });
});
