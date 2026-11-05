import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSlug } from "../domain/editorial.js";
import { loadMigrations, migration } from "./migrations.js";
import {
  databaseGuard,
  disposableDatabase,
  verificationScripts,
  verificationTargets,
} from "./prepare-editorial-verification.js";
const main = "ct_editorial_migration_test";
const bootstrap = "ct_bootstrap_migration_test";

describe("offline disposable SQL verification preparation", () => {
  it("requires two exact distinct disposable names and rejects live, ambiguous or path-like targets", () => {
    expect(
      verificationTargets([
        "--database",
        main,
        "--bootstrap-database",
        bootstrap,
      ]),
    ).toEqual({ database: main, bootstrapDatabase: bootstrap });
    for (const name of [
      "sqldb-called-together-dev",
      "master",
      "",
      "sample",
      "UPPER_migration_test",
      "../ct_migration_test",
      "x';DROP TABLE t;--_migration_test",
      "a".repeat(129) + "_migration_test",
    ])
      expect(() => disposableDatabase(name)).toThrow();
    for (const args of [
      [],
      ["--database", main],
      ["--database", main, "--bootstrap-database", main],
      ["--apply", main, "--bootstrap-database", bootstrap],
    ])
      expect(() => verificationTargets(args)).toThrow();
  });
  it("guards the exact database before any verification can execute", () => {
    const guard = databaseGuard(main);
    expect(guard).toContain(
      "DB_NAME() COLLATE Latin1_General_100_BIN2 <> N'ct_editorial_migration_test'",
    );
    expect(guard).toContain("DB_NAME() = N'sqldb-called-together-dev'");
    expect(guard).toContain("IF @@TRANCOUNT <> 0");
    expect(guard).not.toMatch(/CREATE|INSERT|UPDATE|DELETE|GRANT|DROP/);
  });
  it("normalizes SQL GUID text before deriving fixture slugs and preserves lowercase-only validation", async () => {
    const fixture = await readFile(
      fileURLToPath(
        new URL(
          "../database/verification/editorial.integration.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    // Native SQL execution remains opt-in. Check the SQL source expression as
    // well as a deterministic uppercase GUID case, without random sampling.
    expect(fixture).toMatch(
      /@slug varchar\(160\) = 'verification-' \+ LOWER\(CONVERT\(varchar\(36\), NEWID\(\)\)\)/,
    );
    const guid = "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF";
    expect(isSlug("verification-" + guid)).toBe(false);
    for (const suffix of ["", "-external", "-other"]) {
      const normalized = "verification-" + guid.toLowerCase() + suffix;
      expect(isSlug(normalized)).toBe(true);
      expect(normalized.length).toBeLessThanOrEqual(160);
    }
    const files = await loadMigrations(
      fileURLToPath(new URL("../database/migrations/", import.meta.url)),
    );
    const generated = verificationScripts(files, fixture, main, bootstrap)[
      "03-constraints.sql"
    ]!;
    expect(generated).toContain(
      "'verification-' + LOWER(CONVERT(varchar(36), NEWID()))",
    );
    expect(generated).toContain("UPDATE dbo.Authors SET Slug = UPPER(@slug)");
    expect(generated).toContain(
      "CHARINDEX('CK_Authors_Slug', ERROR_MESSAGE())",
    );
  });
  it("prepares actual runner batches without changing migration content or creating source probe migrations", async () => {
    const files = await loadMigrations(
      fileURLToPath(new URL("../database/migrations/", import.meta.url)),
    );
    const fixture = await readFile(
      fileURLToPath(
        new URL(
          "../database/verification/editorial.integration.sql",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const original = JSON.stringify(files);
    const scripts = verificationScripts(files, fixture, main, bootstrap);
    expect(Object.keys(scripts)).toHaveLength(9);
    for (const [name, source] of Object.entries(scripts)) {
      const selected = name === "06-bootstrap-rollback.sql" ? bootstrap : main;
      expect(source.startsWith(databaseGuard(selected))).toBe(true);
    }
    expect(scripts["03-constraints.sql"]).toContain(
      "@value=N'ct_editorial_migration_test'",
    );
    expect(scripts["03-constraints.sql"]).toContain(
      "Selected submitted revision leaked",
    );
    expect(scripts["03-constraints.sql"]).toContain(
      "Unselected approved revision leaked",
    );
    expect(scripts["03-constraints.sql"]).toContain(
      "Verification fixtures survived rollback",
    );
    const altered = migration(
      files[0]!.filename,
      files[0]!.sql + "\n-- Deliberate verification checksum change.\n",
    );
    expect(scripts["04-checksum.sql"]).toContain(altered.checksum);
    expect(scripts["04-checksum.sql"]).toContain(
      "IF ERROR_NUMBER() <> 51001 THROW",
    );
    expect(
      scripts["05-rollback-after-prefix.sql"]!.match(
        /IF ERROR_NUMBER\(\) <> 52050 THROW/g,
      ),
    ).toHaveLength(2);
    expect(scripts["05-rollback-after-prefix.sql"]).toContain(
      "MigrationAfterFailureProbe",
    );
    expect(
      scripts["06-bootstrap-rollback.sql"]!.match(
        /IF ERROR_NUMBER\(\) <> 52050 THROW/g,
      ),
    ).toHaveLength(2);
    expect(scripts["06-bootstrap-rollback.sql"]).toContain("is_ms_shipped = 0");
    expect(scripts["02-repeat.sql"]).toContain("AppliedAt");
    expect(scripts["02-repeat.sql"]).toContain(
      "EXCEPT SELECT Version, Filename, Checksum, AppliedAt",
    );
    expect(scripts["07-hold-lock.sql"]).toContain(
      "#CalledTogetherHistoryBeforeLock",
    );
    expect(scripts["08-release-lock.sql"]).toContain(
      "Use the same live SQL session",
    );
    expect(JSON.stringify(files)).toBe(original);
  });
});
