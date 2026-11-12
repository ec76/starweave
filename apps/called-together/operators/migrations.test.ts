import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  createApplyBatch,
  historyQuery,
  loadMigrations,
  migration,
  orderMigrations,
  pendingMigrations,
  runMigrations,
} from "./migrations.js";
const first = migration("0001_first.sql", "CREATE TABLE dbo.Example (Id int);");
const second = migration(
  "0002_second.sql",
  "CREATE VIEW dbo.ExampleView AS SELECT Id FROM dbo.Example;",
);

describe("migration files and history", () => {
  it("orders numerically without mutating input and rejects duplicate, missing or invalid versions", () => {
    const input = [second, first];
    expect(orderMigrations(input)).toEqual([first, second]);
    expect(input[0]).toBe(second);
    for (const files of [
      [],
      [second],
      [first, first],
      [first, migration("0003_gap.sql", "SELECT 1;")],
    ])
      expect(() => orderMigrations(files)).toThrow();
    for (const name of ["first.sql", "0001_bad-name.sql", "../0001_first.sql"])
      expect(() => migration(name, "SELECT 1;")).toThrow();
    expect(() => migration("0001_empty.sql", " ")).toThrow();
    expect(() =>
      migration("0001_go.sql", "SELECT 1;\nGO\nSELECT 2;"),
    ).toThrow();
  });
  it("hashes canonical UTF-8 text across Windows and Unix checkouts but detects content edits", () => {
    const original = migration("0001_first.sql", "SELECT N'example';\n");
    expect(
      migration(original.filename, "\uFEFFSELECT N'example';\r\n").checksum,
    ).toBe(original.checksum);
    expect(
      migration(original.filename, "SELECT N'changed';\n").checksum,
    ).not.toBe(original.checksum);
    expect(() =>
      pendingMigrations([first], [{ ...first, checksum: "0".repeat(64) }]),
    ).toThrow(/history differs/);
  });
  it("accepts only an exact prefix and rejects renamed, missing, unknown or reordered history", () => {
    expect(pendingMigrations([second, first], [first])).toEqual([second]);
    expect(pendingMigrations([first, second], [second, first])).toEqual([]);
    for (const history of [
      [second],
      [first, first],
      [{ ...first, filename: "0001_renamed.sql" }],
      [first, second, { ...second, version: 3 }],
    ])
      expect(() => pendingMigrations([first, second], history)).toThrow();
  });
  it("loads the actual initial schema and public view as ordered immutable units", async () => {
    const files = await loadMigrations(
      fileURLToPath(new URL("../database/migrations/", import.meta.url)),
    );
    expect(files.map((file) => file.filename)).toEqual([
      "0001_editorial_schema.sql",
      "0002_public_articles.sql",
      "0003_email_accounts.sql",
      "0004_email_account_operations.sql",
      "0005_verification_identifier_capacity.sql",
      "0006_password_accounts_and_activity.sql",
      "0007_password_account_operations.sql",
    ]);
    expect(new Set(files.map((file) => file.checksum)).size).toBe(files.length);
  });
});
describe("migration execution boundaries", () => {
  it("never applies during status/dry-run and rejects checksum drift before writes", async () => {
    const store = {
      readHistory: vi.fn().mockResolvedValue([]),
      apply: vi.fn(),
    };
    expect(await runMigrations(store, [first, second], false)).toEqual([
      first,
      second,
    ]);
    expect(store.apply).not.toHaveBeenCalled();
    store.readHistory.mockResolvedValue([{ ...first, checksum: "edited" }]);
    await expect(runMigrations(store, [first, second], true)).rejects.toThrow(
      /history differs/,
    );
    expect(store.apply).not.toHaveBeenCalled();
  });
  it("rechecks the full history inside the locked batch even when the preliminary read has nothing pending", async () => {
    const store = {
      readHistory: vi.fn().mockResolvedValue([first, second]),
      apply: vi.fn().mockResolvedValue(undefined),
    };
    expect(await runMigrations(store, [first, second], true)).toEqual([]);
    expect(store.apply).toHaveBeenCalledExactlyOnceWith([first, second]);
  });
  it("propagates batch failure and does not retry or mark success", async () => {
    const store = {
      readHistory: vi.fn().mockResolvedValue([]),
      apply: vi.fn().mockRejectedValue(new Error("failed transaction")),
    };
    await expect(runMigrations(store, [first, second], true)).rejects.toThrow(
      "failed transaction",
    );
    expect(store.apply).toHaveBeenCalledTimes(1);
  });
  it("builds one session-locked batch with history validation before transactional DDL and rollback/release on failure", () => {
    const batch = createApplyBatch([first, second]);
    expect(batch.indexOf("sp_getapplock")).toBeLessThan(
      batch.indexOf("Migration history differs"),
    );
    expect(batch.indexOf("Migration history differs")).toBeLessThan(
      batch.indexOf("CREATE TABLE dbo.CalledTogetherMigrations"),
    );
    expect(batch).toContain("@LockOwner = 'Session'");
    expect(batch).toContain("@LockTimeout = 0");
    expect(batch.match(/BEGIN TRANSACTION;/g)).toHaveLength(2);
    expect(batch.match(/COMMIT TRANSACTION;/g)).toHaveLength(2);
    expect(batch).toContain("IF XACT_STATE() <> 0 ROLLBACK TRANSACTION");
    expect(batch).toContain("BEGIN CATCH");
    expect(batch.match(/sp_releaseapplock/g)).toHaveLength(2);
    expect(
      createApplyBatch([migration("0001_quotes.sql", "SELECT N'quoted';")]),
    ).toContain("SELECT N''quoted'';");
    expect(historyQuery).not.toMatch(/CREATE|INSERT|UPDATE|DELETE/);
  });
});
