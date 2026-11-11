import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { accountService } from "./admin/service";
import { activityFilter } from "./admin/activity.ts";
import {
  requireEditorialRole,
  requireIndependentApprover,
  requireRoles,
  accountIssuer,
} from "../domain/accounts";
import type { AccountRepository } from "./admin/repository";
import type { AdminSession } from "../domain/admin-auth";
import { adminConfig } from "./admin/config";
const id = "11111111-1111-4111-8111-111111111111";
const session = (roles: AdminSession["roles"]): AdminSession => ({
  id,
  userId: id,
  actorId: id,
  email: "fixture@example.invalid",
  identity: { issuer: accountIssuer, subject: id, displayName: "Fixture" },
  roles,
  expiresAt: Date.now() / 1000 + 10000,
});
afterEach(() => vi.restoreAllMocks());
describe("account and audit policy", () => {
  it("creates with assigned additive roles and never trusts client actor fields", async () => {
    const manage = vi.fn(async () => {}),
      repository = { manage } as unknown as AccountRepository;
    const form = new FormData();
    form.set("action", "create");
    form.set("email", "FIXTURE@example.invalid");
    form.set("name", " Fixture ");
    form.append("roles", "Writer");
    form.append("roles", "Approver");
    form.set("actor", "untrusted");
    await accountService(repository).manage(session(["Administrator"]), form);
    expect(manage).toHaveBeenCalledWith(id, {
      action: "create",
      email: "fixture@example.invalid",
      name: "Fixture",
      roles: ["Writer", "Approver"],
    });
    form.delete("roles");
    await expect(
      accountService(repository).manage(session(["Administrator"]), form),
    ).rejects.toThrow();
    await expect(
      accountService(repository).manage(session(["Writer"]), form),
    ).rejects.toThrow();
  });
  it("Administrator alone grants neither editorial permission nor self-approval", () => {
    expect(() => requireEditorialRole(session(["Administrator"]))).toThrow();
    expect(() =>
      requireIndependentApprover(session(["Administrator", "Approver"]), id),
    ).toThrow();
    expect(
      requireIndependentApprover(session(["Approver"]), "other-actor").userId,
    ).toBe(id);
    expect(() =>
      requireRoles(session(["Writer"]), ["Administrator"]),
    ).toThrow();
  });
  it("bounds activity paging and validates exact dates, account IDs and event filters", () => {
    expect(
      activityFilter({
        page: "2",
        event: "login",
        from: "2026-11-01",
        until: "2026-11-02",
        account: id,
      }).page,
    ).toBe(2);
    for (const params of [
      { page: "0" },
      { page: "10001" },
      { page: ["1", "2"] },
      { event: "private-error" },
      { from: "2026-02-30" },
      { account: "email@example.invalid" },
      { from: "2026-11-02", until: "2026-11-01" },
    ])
      expect(() => activityFilter(params)).toThrow();
  });
  it("bounds configurable sessions and keeps deployed authentication closed", () => {
    const env = {
      NODE_ENV: "development",
      ADMIN_AUTH_ORIGIN: "https://localhost:3001",
      ADMIN_AUTH_SECRET: Buffer.alloc(32, 7).toString("base64url"),
      AUTH_EMAIL_DELIVERY: "development-preview",
    };
    expect(adminConfig(env).sessionSeconds).toBe(43200);
    for (const seconds of ["0", "900", "604801", "not-a-number", "43200.5"])
      expect(() =>
        adminConfig({ ...env, ADMIN_SESSION_SECONDS: seconds }),
      ).toThrow();
    expect(() => adminConfig({ ...env, NODE_ENV: "production" })).toThrow();
    expect(() =>
      adminConfig({ ...env, WEBSITE_SITE_NAME: "deployed" }),
    ).toThrow();
  });
});
