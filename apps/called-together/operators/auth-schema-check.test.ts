import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlQueryCompiler,
  type DatabaseConnection,
  type TableMetadata,
} from "kysely";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { schemaCheckFor } from "@better-auth/core/db/internal";
vi.mock("server-only", () => ({}));
import { authOptions } from "../server/admin/auth.ts";
import { authTransaction } from "../server/admin/transaction.ts";

describe("installed Better Auth MSSQL schema check", () => {
  it("rejects a Kysely Transaction but validates the migration schema on a held connection", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_EMAIL_DELIVERY", "development-preview");
    vi.stubEnv("ADMIN_AUTH_ORIGIN", "https://localhost:3001");
    vi.stubEnv("ADMIN_AUTH_SECRET", Buffer.alloc(32, 7).toString("base64url"));
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    vi.stubEnv("WEBSITE_INSTANCE_ID", "");
    const source = readFileSync(
      new URL(
        "../database/migrations/0003_email_accounts.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const tables: TableMetadata[] = [];
    for (const name of [
      "AuthUsers",
      "AuthSessions",
      "AuthAccounts",
      "AuthVerifications",
    ]) {
      const body = source
        .split("CREATE TABLE dbo." + name + " (")[1]!
        .split("\n);")[0]!;
      tables.push({
        name,
        schema: "dbo",
        isView: false,
        isForeign: false,
        columns: body.split("\n").flatMap((line) => {
          const match =
            /^\s+(\w+) (nvarchar|bit|datetime2|uniqueidentifier)\b/.exec(line);
          return match
            ? [
                {
                  name: match[1]!,
                  dataType: match[2]!,
                  isNullable: !line.includes("NOT NULL"),
                  isAutoIncrementing: false,
                  hasDefaultValue: line.includes("DEFAULT"),
                  comment: undefined,
                },
              ]
            : [];
        }),
      });
    }
    let acquisitions = 0,
      metadataReads = 0;
    class Driver extends DummyDriver {
      override async acquireConnection(): Promise<DatabaseConnection> {
        acquisitions++;
        return {
          executeQuery: async <R>() => ({ rows: [{ schemaName: "dbo" } as R] }),
          async *streamQuery<R>() {
            yield { rows: [] as R[] };
          },
        };
      }
    }
    const db = new Kysely<Record<string, never>>({
      dialect: {
        createDriver: () => new Driver(),
        createAdapter: () => new MssqlAdapter(),
        createQueryCompiler: () => new MssqlQueryCompiler(),
        createIntrospector: () => ({
          getSchemas: async () => [{ name: "dbo" }],
          getTables: async () => {
            metadataReads++;
            return tables;
          },
          getMetadata: async () => ({ tables }),
        }),
      },
    });
    try {
      const options = authOptions();
      await db.connection().execute(async (pinned) => {
        await pinned.transaction().execute(async (transaction) => {
          const adapter = kyselyAdapter(transaction, {
            type: "mssql",
            transaction: false,
          })(options);
          await expect(schemaCheckFor(adapter)!()).rejects.toThrow(
            "calling the connection method for a Transaction is not supported",
          );
          expect(metadataReads).toBe(0);
        });
        await authTransaction(pinned, async (connection) => {
          const adapter = kyselyAdapter(connection, {
            type: "mssql",
            transaction: false,
          })(options);
          await expect(
            Promise.resolve(schemaCheckFor(adapter)!()),
          ).resolves.toBeUndefined();
          expect(metadataReads).toBe(1);
          expect(acquisitions).toBe(1);
          const users = tables.find((table) => table.name === "AuthUsers")!;
          const originalColumns = users.columns;
          Object.assign(users, {
            columns: originalColumns.filter(
              (column) => column.name !== "email",
            ),
          });
          const invalid = kyselyAdapter(connection, {
            type: "mssql",
            transaction: false,
          })(options);
          await expect(schemaCheckFor(invalid)!()).rejects.toMatchObject({
            findings: expect.arrayContaining([
              { kind: "missing-column", table: "AuthUsers", column: "email" },
            ]),
          });
          Object.assign(users, { columns: originalColumns });
        });
      });
    } finally {
      await db.destroy();
      vi.unstubAllEnvs();
    }
  });
});
