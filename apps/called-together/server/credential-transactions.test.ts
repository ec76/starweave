import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
vi.mock("server-only", () => ({}));
vi.mock("./admin/auth.ts", () => ({
  getAuthDatabase: vi.fn(),
  createAuthWithDatabase: vi.fn(),
}));
import { createAuthWithDatabase } from "./admin/auth.ts";
import { credentialOperation } from "./admin/credentials.ts";
let events: string[],
  statements: CompiledQuery[],
  allowed: boolean,
  failAudit: boolean;
const id = "11111111-1111-4111-8111-111111111111";
class Driver extends DummyDriver {
  override async acquireConnection(): Promise<DatabaseConnection> {
    events.push("acquire");
    return {
      executeQuery: async <R>(query: CompiledQuery) => {
        statements.push(query);
        if (failAudit && query.sql.includes("AuthRecordSessionEvent"))
          throw new Error("PRIVATE_SENTINEL");
        return {
          rows: (query.sql.includes("SELECT u.id") && allowed
            ? [{ id }]
            : []) as R[],
        };
      },
      async *streamQuery<R>() {
        yield { rows: [] as R[] };
      },
    };
  }
  override async beginTransaction() {
    events.push("begin");
  }
  override async commitTransaction() {
    events.push("commit");
  }
  override async rollbackTransaction() {
    events.push("rollback");
  }
  override async releaseConnection() {
    events.push("release");
  }
}
function database() {
  return new Kysely<Record<string, never>>({
    dialect: {
      createDriver: () => new Driver(),
      createAdapter: () => new MssqlAdapter(),
      createQueryCompiler: () => new MssqlQueryCompiler(),
      createIntrospector: (db) => new MssqlIntrospector(db),
    },
  });
}
beforeEach(() => {
  events = [];
  statements = [];
  allowed = true;
  failAudit = false;
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());
it.each(["login", "logout", "setup-finish", "reset-finish"] as const)(
  "keeps %s policy, library hooks and audit on one connection/transaction",
  async (action) => {
    const db = database();
    vi.mocked(createAuthWithDatabase).mockImplementation(
      (connection, dependencies, transaction, purpose) => {
        expect(connection.isTransaction).toBe(false);
        expect(transaction).toBe(false);
        return {
          handler: async () => {
            if (action === "login") {
              await dependencies!.beginSession(id);
              await dependencies!.recordSessionEvent(id, "sign_in");
            }
            if (action === "logout")
              await dependencies!.recordSessionEvent(id, "sign_out");
            if (action.endsWith("finish")) {
              expect(purpose).toBe(
                action.startsWith("setup") ? "setup" : "reset",
              );
              await dependencies!.completePassword(id);
            }
            return new Response(null, { status: 200 });
          },
        } as unknown as ReturnType<typeof createAuthWithDatabase>;
      },
    );
    try {
      expect(
        (
          await credentialOperation(
            action,
            {
              email: "fixture@example.invalid",
              password: "Fictional password",
              code: "12345678",
            },
            new Request("https://localhost:3001", {
              headers: { origin: "https://localhost:3001" },
            }),
            db,
          )
        ).ok,
      ).toBe(true);
      expect(events).toEqual(["acquire", "begin", "commit", "release"]);
      expect(statements[0]?.sql.includes("sp_getapplock")).toBe(true);
      const policy = statements.find((s) => s.sql.includes("SELECT u.id"));
      if (action !== "logout") {
        expect(policy?.sql.includes("u.disabled=0")).toBe(true);
        expect(policy?.sql.includes("i.AcceptedAt IS NOT NULL")).toBe(true);
        expect(policy?.sql.includes("u.activatedAt IS NOT NULL")).toBe(true);
        expect(
          policy?.parameters[1] === (action.startsWith("setup") ? 1 : 0),
        ).toBe(true);
      }
    } finally {
      await db.destroy();
    }
  },
);
it("rolls back login session creation when its business audit write fails", async () => {
  const db = database();
  failAudit = true;
  vi.mocked(createAuthWithDatabase).mockImplementation(
    (_, dependencies) =>
      ({
        handler: async () => {
          await dependencies!.beginSession(id);
          await dependencies!.recordSessionEvent(id, "sign_in");
          return new Response();
        },
      }) as unknown as ReturnType<typeof createAuthWithDatabase>,
  );
  try {
    await expect(
      credentialOperation(
        "login",
        { email: "fixture@example.invalid" },
        new Request("https://localhost:3001"),
        db,
      ),
    ).rejects.toThrow("PRIVATE_SENTINEL");
    expect(events).toEqual(["acquire", "begin", "rollback", "release"]);
  } finally {
    await db.destroy();
  }
});
it("does not call authentication primitives for an ineligible account", async () => {
  const db = database();
  allowed = false;
  try {
    expect(
      (
        await credentialOperation(
          "setup-code",
          { email: "fixture@example.invalid" },
          new Request("https://localhost:3001"),
          db,
        )
      ).ok,
    ).toBe(false);
    expect(createAuthWithDatabase).not.toHaveBeenCalled();
  } finally {
    await db.destroy();
  }
});
