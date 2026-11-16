import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const directory = "database/verification/";
const read = (name: string) => readFile(directory + name, "utf8");
function rows(source: string) {
  return [
    ...source.matchAll(
      /\(\s*N'(\w+)'\s*,\s*N'([\w ]+)'\s*,\s*(NULL|N'\w+')\s*,\s*([01])\s*\)/g,
    ),
  ].map((m) => ({
    object: m[1]!,
    permission: m[2]!,
    column: m[3] === "NULL" ? null : m[3]!.slice(2, -1),
    allowed: m[4] === "1",
  }));
}
describe("proposed restricted runtime permission contract (no SQL execution)", () => {
  it("keeps owner checks and actual-identity status on the same exhaustive object/column contract", async () => {
    const owner = await read("password-runtime-permissions.sql"),
      status = await read("password-runtime-permission-status.sql");
    const contract = rows(status);
    expect(contract.length).toBeGreaterThan(300);
    expect(rows(owner)).toEqual(contract);
    const post = owner
      .slice(owner.indexOf("DECLARE @Postcheck"))
      .replaceAll("''", "'");
    expect(rows(post)).toEqual(contract);
    const allowed = contract.filter(
      (r) => r.allowed && r.permission === "UPDATE",
    );
    expect(allowed).toEqual([
      {
        object: "AuthUsers",
        permission: "UPDATE",
        column: "emailVerified",
        allowed: true,
      },
      {
        object: "AuthUsers",
        permission: "UPDATE",
        column: "updatedAt",
        allowed: true,
      },
      {
        object: "AuthAccounts",
        permission: "UPDATE",
        column: "password",
        allowed: true,
      },
      {
        object: "AuthAccounts",
        permission: "UPDATE",
        column: "updatedAt",
        allowed: true,
      },
      {
        object: "AuthNotifications",
        permission: "UPDATE",
        column: "DeliveredAt",
        allowed: true,
      },
    ]);
    for (const table of [
      "AuthUsers",
      "AuthRoleAssignments",
      "AuthInvitations",
      "ActivityEvents",
      "AuthAuditEvents",
      "AuthSecurityBuckets",
      "AuthThrottleBuckets",
    ])
      expect(
        contract.some(
          (r) =>
            r.object === table &&
            ["INSERT", "DELETE"].includes(r.permission) &&
            r.allowed,
        ),
      ).toBe(false);
    for (const proc of ["AuthBootstrapAdministrator", "AuthRecoverPending"])
      expect(
        contract.find((r) => r.object === proc && r.permission === "EXECUTE")
          ?.allowed,
      ).toBe(false);
  });
  it("repairs only direct auth grants transactionally, closes column exceptions, and leaves public SELECT alone", async () => {
    const owner = await read("password-runtime-permissions.sql");
    expect(owner).toMatch(/@Apply\s+(?:AS\s+)?bit\s*=\s*0\b/i);
    expect(owner.indexOf("BEGIN TRANSACTION;")).toBeGreaterThan(-1);
    expect(owner.indexOf("BEGIN TRANSACTION;")).toBeLessThan(
      owner.search(/EXEC(?:UTE)?\s+sys\.sp_executesql\s+@Grant\b/i),
    );
    expect(
      owner.search(/EXEC(?:UTE)?\s+sys\.sp_executesql\s+@Postcheck\b/i),
    ).toBeGreaterThan(-1);
    expect(owner.indexOf("COMMIT TRANSACTION;")).toBeGreaterThan(-1);
    expect(
      owner.search(/EXEC(?:UTE)?\s+sys\.sp_executesql\s+@Postcheck\b/i),
    ).toBeLessThan(owner.indexOf("COMMIT TRANSACTION;"));
    expect(owner).toMatch(
      /IF\s+XACT_STATE\(\)\s*<>\s*0\s+ROLLBACK(?:\s+TRANSACTION)?\s*;/i,
    );
    expect(owner).toMatch(
      /CAST\s*\(N''\s+AS\s+nvarchar\s*\(max\)\)\s*\+\s*N'/i,
    );
    expect(owner).toContain(
      "GRANT UPDATE ON OBJECT::dbo.AuthUsers (emailVerified,updatedAt)",
    );
    expect(owner).not.toContain("GRANT UPDATE ON OBJECT::dbo.AuthUsers TO");
    expect(owner).not.toContain("GRANT INSERT ON OBJECT::dbo.AuthUsers");
    expect(owner).not.toContain("GRANT DELETE ON OBJECT::dbo.AuthUsers");
    expect(owner).toContain(
      "DENY UPDATE ON OBJECT::dbo.AuthUsers (id,name,email,image,createdAt,disabled,actorId,activatedAt)",
    );
    expect(owner).toContain(
      "DENY SELECT ON OBJECT::dbo.ActivityEvents (Id,OccurredAt",
    );
    expect(owner).toContain("@publicBefore");
    expect(owner).toContain("Public article SELECT changed.");
    expect(owner).not.toMatch(
      /(?:GRANT|DENY|REVOKE)[^;\n]*ON OBJECT::dbo\.PublicArticles/i,
    );
    expect(owner).not.toMatch(/\b(?:CREATE USER|ALTER ROLE|CREATE ROLE)\b/i);
  });
  it("checks ownership, effective and inherited authority and always reverts impersonation", async () => {
    const owner = await read("password-runtime-permissions.sql"),
      status = await read("password-runtime-permission-status.sql");
    for (const text of [owner, status]) {
      for (const marker of [
        "sys.user_token",
        "sys.schemas",
        "owning_principal_id",
        "sys.fn_my_permissions",
        "HAS_PERMS_BY_NAME",
        "CONTROL",
        "ALTER",
        "IMPERSONATE",
      ])
        expect(text).toContain(marker);
      expect(text).toMatch(/p\.state\s*=/);
      expect(text).toMatch(/ColumnName\s*,\s*N'/);
    }
    expect(owner).toMatch(/t\.Id\s*<>\s*@id/);
    expect(owner).toContain("sys.database_role_members");
    expect(owner.match(/IF @switched=1 REVERT;/g)).toHaveLength(2);
    expect(status).toContain("USER_NAME() COLLATE");
  });
  it("requires permission denials rather than immutable triggers/business rejection and rolls every probe back", async () => {
    const probes = await read("password-runtime-denial-probes.sql");
    expect(probes).toMatch(/@error\s+IN\s*\(229\s*,\s*230\)/i);
    expect(probes).not.toContain("53220");
    expect(probes).toMatch(
      /IF\s+XACT_STATE\(\)\s*<>\s*0\s+ROLLBACK(?:\s+TRANSACTION)?\s*;/i,
    );
    expect(probes).not.toMatch(/\bCOMMIT\b/);
    expect(probes).not.toMatch(/ERROR_MESSAGE\(/);
    for (const operation of [
      "RoleInsert",
      "RoleUpdate",
      "RoleDelete",
      "ActivityInsert",
      "ActivityUpdate",
      "ActivityDelete",
      "OperatorBootstrap",
      "OperatorRecovery",
      "UserLibraryColumns",
      "CredentialLibraryColumns",
      "NotificationDelivery",
    ])
      expect(probes).toContain(operation);
  });
});
