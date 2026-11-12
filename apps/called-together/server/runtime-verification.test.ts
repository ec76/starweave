import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mssql from "mssql";
import {
  DummyDriver,
  Kysely,
  MssqlAdapter,
  MssqlIntrospector,
  MssqlQueryCompiler,
  type DatabaseConnection,
  type CompiledQuery,
} from "kysely";
const mocks = vi.hoisted(() => ({
  getPool: vi.fn(),
  getAuthDatabase: vi.fn(),
  configuredAdmin: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./database", () => ({ database: { getPool: mocks.getPool } }));
vi.mock("./admin/auth", () => ({ getAuthDatabase: mocks.getAuthDatabase }));
vi.mock("./admin/config", () => ({ configuredAdmin: mocks.configuredAdmin }));
vi.mock("./admin/handlers", () => ({
  adminJson: (body: unknown, status = 200) => Response.json(body, { status }),
}));
import { GET } from "../app/api/admin/verification/route";
let libraryMatches: boolean, mssqlMatches: boolean, statements: CompiledQuery[];
class Driver extends DummyDriver {
  override async acquireConnection(): Promise<DatabaseConnection> {
    return {
      executeQuery: async <R>(query: CompiledQuery) => {
        statements.push(query);
        return { rows: [{ RuntimeMatch: libraryMatches } as R] };
      },
      async *streamQuery<R>() {
        yield { rows: [] as R[] };
      },
    };
  }
}
beforeEach(() => {
  vi.clearAllMocks();
  libraryMatches = true;
  mssqlMatches = true;
  statements = [];
  vi.stubEnv("AUTH_INTEGRATION", "1");
  vi.stubEnv("SQL_DATABASE", "ct_password_auth_test");
  vi.stubEnv("AUTH_VERIFY_RUNTIME_USER", "restricted-fixture");
  mocks.configuredAdmin.mockReturnValue({});
  mocks.getPool.mockResolvedValue({ request: () => new mssql.Request() });
  vi.spyOn(mssql.Request.prototype, "query").mockImplementation((async () => ({
    recordset: [{ Ready: true, RuntimeMatch: mssqlMatches }],
  })) as never);
  mocks.getAuthDatabase.mockReturnValue(
    new Kysely({
      dialect: {
        createDriver: () => new Driver(),
        createAdapter: () => new MssqlAdapter(),
        createQueryCompiler: () => new MssqlQueryCompiler(),
        createIntrospector: (db) => new MssqlIntrospector(db),
      },
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const request = () =>
  new Request(
    "https://localhost/api/admin/verification?database=ct_password_auth_test",
  );
describe("restricted runtime identity in both application pools", () => {
  it("requires the expected identity in mssql and library pools", async () => {
    expect(await (await GET(request())).json()).toEqual({
      ready: true,
      runtimeIdentityMatches: true,
    });
    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toContain("USER_ID()>4");
    expect(statements[0]!.sql).not.toContain("restricted-fixture");
    expect(statements[0]!.parameters).toEqual([
      "ct_password_auth_test",
      "restricted-fixture",
    ]);
  });
  it.each(["mssql", "library"])(
    "rejects identity mismatch in %s",
    async (pool) => {
      if (pool === "mssql") mssqlMatches = false;
      else libraryMatches = false;
      expect(await (await GET(request())).json()).toEqual({
        ready: false,
        runtimeIdentityMatches: false,
      });
    },
  );
  it("keeps identity verification optional for the existing ordinary route verifier", async () => {
    vi.stubEnv("AUTH_VERIFY_RUNTIME_USER", undefined);
    expect(await (await GET(request())).json()).toEqual({ ready: true });
    expect(mocks.getAuthDatabase).not.toHaveBeenCalled();
  });
  it("never accesses either pool when deployed auth is closed", async () => {
    mocks.configuredAdmin.mockReturnValue(null);
    expect((await GET(request())).status).toBe(404);
    expect(mocks.getPool).not.toHaveBeenCalled();
    expect(mocks.getAuthDatabase).not.toHaveBeenCalled();
  });
});
