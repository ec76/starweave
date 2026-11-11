import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadMigrations, pendingMigrations } from "./migrations.ts";
import { authApplySql } from "./prepare-auth-verification.ts";

describe("read-only recovery inspection for failed password migrations", () => {
  it("preserves all seven owner-applied migration checksums", async () => {
    const files = await loadMigrations("database/migrations");
    expect(files.map((file) => file.checksum)).toEqual([
      "6ababa871a4679153b99c7fbb918b915491fa859b0876a76513bb64ac6b86485",
      "b6b92838fa0c8d029690dde5d0de172dfe29f46ac8cd6a2e0d54d15dbc27216f",
      "2ae528aa634d1f0afd085c2e1c4b1be937a919e2dfb9c5a5e780cd6a9e829990",
      "30edabc68219c619e372ba71c8e376cacbedc3d37f605def3ad63db3870d9cfe",
      "ab4a8d212384f339bd36b74f35fb7d4536e0b20dad6a7a2f15233cac7af778d1",
      "15755292dfa4e247e176d4201d45e7a9003ba1f6f6f75e7ac1e4df7ff0baba2a",
      "bd3d5806aeb848dd5f760b9a8f890a67cabe2b6d756e65a828e6f9cef7c7539c",
    ]);
  });
  it("aligns every activity UNION text projection and verifies the version-six recovery baseline", async () => {
    const files = await loadMigrations("database/migrations");
    const batch = authApplySql("ct_password_auth_test", files);
    const outer = batch
      .slice(batch.indexOf("WHERE version = 7)"))
      .match(/EXEC sys\.sp_executesql N'((?:[^']|'')*)';/)!;
    const decoded = outer[1]!.replaceAll("''", "'");
    expect(decoded).toBe(files[6]!.sql);
    const body = decoded.match(
      /CREATE PROCEDURE dbo.AuthListActivity[\s\S]*?WITH events AS \(([\s\S]*?)\)\s*SELECT Id AS id/,
    )![1]!;
    const branches = body.split("UNION ALL");
    expect(branches).toHaveLength(2);
    for (const branch of branches)
      expect(branch.match(/COLLATE Latin1_General_100_BIN2/g)).toHaveLength(7);
    expect(body.match(/CAST\(NULL AS nvarchar\(36\)\)/g)).toHaveLength(2);
    expect(body).toContain("CAST(NULL AS varchar(20))");
    const status = await readFile(
      "database/verification/password-migration-0007-recovery-status.sql",
      "utf8",
    );
    for (const file of files.slice(0, 6))
      expect(status).toContain(file.checksum);
    expect(status).toContain("Migrations) = 6");
    expect(status).toContain("Migration6TriggersPresent");
    expect(status).toContain("Migration7ProceduresAbsent");
    expect(status).toContain("OriginalProcedureDefinitionsIntact");
    expect(status).toContain("SET @entryState = XACT_STATE();");
    expect(status).toContain("SET @finalState = XACT_STATE();");
    expect(status.replace(/--[^\r\n]*/g, "")).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|EXEC|CREATE|ALTER|DROP|COMMIT|ROLLBACK)\b/i,
    );
  });
  it("the source constraint uses the binary identity collation and the real generated batch preserves it", async () => {
    const files = await loadMigrations("database/migrations");
    const legacy = files[2]!.sql;
    expect(legacy).toMatch(/accountId nvarchar\(255\) NOT NULL/);
    expect(legacy).toMatch(
      /userId nvarchar\(36\) COLLATE Latin1_General_100_BIN2 NOT NULL/,
    );
    const source = files[5]!;
    expect(source.sql).toContain(
      "accountId COLLATE Latin1_General_100_BIN2 = userId",
    );
    expect(source.sql).not.toMatch(/\baccountId\s*=\s*userId\b/);
    expect(
      pendingMigrations(files, files.slice(0, 5)).map((file) => file.version),
    ).toEqual([6, 7]);
    const batch = authApplySql("ct_password_auth_test", files);
    const executable = batch
      .slice(batch.indexOf("WHERE version = 6)"))
      .match(/EXEC sys\.sp_executesql N'((?:[^']|'')*)';/);
    expect(executable).not.toBeNull();
    // Decode the executable dynamic batch, not merely a matching comment or
    // another occurrence elsewhere in the generated file.
    const decoded = executable![1]!.replaceAll("''", "'");
    expect(decoded).toBe(source.sql);
    const constraint = decoded.match(
      /ADD CONSTRAINT CK_AuthAccounts_Credentials CHECK \(([\s\S]*?)\);/,
    )![1]!;
    expect(constraint.match(/=/g)).toHaveLength(2);
    expect(constraint).toContain("providerId = N'credential'");
    expect(constraint).toContain(
      "accountId COLLATE Latin1_General_100_BIN2 = userId",
    );
    expect(batch).toContain(source.checksum);
    expect(batch).toContain(
      "accountId COLLATE Latin1_General_100_BIN2 = userId",
    );
    expect(
      batch.indexOf("BEGIN TRANSACTION;", batch.indexOf("version = 6")),
    ).toBeLessThan(batch.indexOf("ALTER TABLE dbo.AuthUsers ADD activatedAt"));
    expect(batch).toContain("IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;");
    expect(batch.indexOf("IF (@@OPTIONS & 2)=2 THROW 53115")).toBeLessThan(
      batch.indexOf("sys.sp_getapplock"),
    );
  });
  it("pins the original migration checksums used by the owner inspection", async () => {
    const files = await loadMigrations("database/migrations");
    const status = await readFile(
      "database/verification/password-migration-recovery-status.sql",
      "utf8",
    );
    const expected = [
      "6ababa871a4679153b99c7fbb918b915491fa859b0876a76513bb64ac6b86485",
      "b6b92838fa0c8d029690dde5d0de172dfe29f46ac8cd6a2e0d54d15dbc27216f",
      "2ae528aa634d1f0afd085c2e1c4b1be937a919e2dfb9c5a5e780cd6a9e829990",
      "30edabc68219c619e372ba71c8e376cacbedc3d37f605def3ad63db3870d9cfe",
      "ab4a8d212384f339bd36b74f35fb7d4536e0b20dad6a7a2f15233cac7af778d1",
    ];
    expect(files.slice(0, 5).map((file) => file.checksum)).toEqual(expected);
    for (const checksum of expected) expect(status).toContain(checksum);
  });

  it("checks original procedure definitions without exposing their text", async () => {
    const files = await loadMigrations("database/migrations");
    const status = await readFile(
      "database/verification/password-migration-recovery-status.sql",
      "utf8",
    );
    const bodies = [
      ...files[3]!.sql.matchAll(/EXEC sys\.sp_executesql N'((?:[^']|'')*)';/g),
    ];
    expect(bodies).toHaveLength(5);
    for (const match of bodies) {
      const body = match[1]!.replaceAll("''", "'");
      const hash = createHash("sha256")
        .update(Buffer.from(body, "utf16le"))
        .digest("hex");
      expect(status).toContain(hash);
    }
    expect(status).toContain("OBJECT_DEFINITION");
    expect(status).toContain("Full database metadata visibility is required");
    // Ignore comments: inspection may only read metadata/history, not repair it.
    const statements = status.replace(/--[^\r\n]*/g, "");
    expect(statements).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|EXEC|EXECUTE|GRANT|REVOKE)\b/i,
    );
  });

  it("covers the schema markers written by 0006 and newly introduced by 0007", async () => {
    const status = await readFile(
      "database/verification/password-migration-recovery-status.sql",
      "utf8",
    );
    for (const name of [
      "activatedAt",
      "CK_AuthAccounts_NoCredentials",
      "CK_AuthAccounts_Credentials",
      "UX_AuthAccounts_CredentialUser",
      "AuthSetupVerifications",
      "AuthNotifications",
      "ActivityEvents",
      "AuthSecurityBuckets",
      "ActivityEvents_Immutable",
      "AuthAuditEvents_Immutable",
      "AuthCompletePassword",
      "AuthSecurityEvent",
      "AuthListActivity",
      "AuthRecoverPending",
    ])
      expect(status).toContain(name);
    expect(status).toContain("MIN(Passed) OVER () AS CleanUnappliedBaseline");
    expect(status).toContain("ct_password_auth_test");
    expect(status).toContain("is_disabled=0 AND is_not_trusted=0");
  });
  it("rejects implicit mode before inspection reads tables and reports entry/final transaction state", async () => {
    const status = await readFile(
      "database/verification/password-migration-recovery-status.sql",
      "utf8",
    );
    expect(status.indexOf("IF @entryImplicit <> 0")).toBeLessThan(
      status.indexOf("FROM dbo.CalledTogetherMigrations"),
    );
    expect(status.indexOf("EntryOpenTransactions")).toBeLessThan(
      status.indexOf("FROM dbo.CalledTogetherMigrations"),
    );
    expect(status).toContain("ImplicitTransactionsEnabled");
    expect(status).toContain("FinalOpenTransactions");
    expect(status).toContain("@entryTransactions=0 AND @entryState=0");
    expect(status).toContain("SET @entryTransactions = @@TRANCOUNT;");
    expect(status).toContain("SET @entryState = XACT_STATE();");
    expect(status).toContain("SET @inspectionState = XACT_STATE();");
    expect(status).toContain("SET @finalState = XACT_STATE();");
    expect(status.indexOf("THROW 53304")).toBeLessThan(
      status.indexOf("HAS_PERMS_BY_NAME"),
    );
    expect(status.indexOf("SET @entryState")).toBeLessThan(
      status.indexOf("SELECT @@SPID"),
    );
    expect(status.indexOf("SET @inspectionState")).toBeGreaterThan(
      status.indexOf("APPLOCK_TEST"),
    );
    expect(status.indexOf("SET @finalState")).toBeGreaterThan(
      status.indexOf("FROM checks ORDER BY CheckName"),
    );
    expect(status).toContain("THROW 53305");
    // State functions may appear only in standalone SET assignments. In a
    // SELECT/CTE they can measure that statement's own autocommit transaction.
    const withoutAssignments = status
      .replace(/--[^\r\n]*/g, "")
      .replace(/SET @\w+ = (?:@@TRANCOUNT|XACT_STATE\(\));/g, "");
    expect(withoutAssignments).not.toMatch(/@@TRANCOUNT|XACT_STATE\(/);
    expect(status).toContain("APPLOCK_TEST");
    expect(status).not.toMatch(/\bsp_(?:get|release)applock\b/i);
    expect(status.replace(/--[^\r\n]*/g, "")).not.toMatch(
      /\b(?:COMMIT|ROLLBACK)\b/i,
    );
  });
});
