import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  Pool: vi.fn(),
  load: vi.fn(),
  cli: vi.fn(),
  managed: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("mssql", () => ({ default: { ConnectionPool: mocks.Pool } }));
vi.mock("@azure/identity", () => ({
  AzureCliCredential: mocks.cli,
  ManagedIdentityCredential: mocks.managed,
}));
vi.mock("./migrations.js", async (original) => ({
  ...(await original<typeof import("./migrations.js")>()),
  loadMigrations: mocks.load,
}));
import { migrate, migrationConfig, migrationMode } from "./migrate.js";
import { historyQuery, migration } from "./migrations.js";
const file = migration("0001_test.sql", "SELECT 1;");
function fixture() {
  const batch = vi.fn().mockResolvedValue({ recordset: [] });
  const pool = {
    connect: vi.fn().mockResolvedValue(undefined),
    request: vi.fn(() => ({ batch })),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  mocks.Pool.mockImplementation(function () {
    return pool;
  });
  return { pool, batch };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SQL_SERVER", "example.database.windows.net");
  vi.stubEnv("SQL_DATABASE", "example-db");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  mocks.cli.mockImplementation(function () {
    return { getToken: vi.fn() };
  });
  mocks.load.mockResolvedValue([file]);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("private migration operator", () => {
  it("requires apply explicitly and refuses ambiguous or unknown flags", () => {
    expect(migrationMode([])).toBe("dry-run");
    expect(migrationMode(["--dry-run"])).toBe("dry-run");
    expect(migrationMode(["--status"])).toBe("status");
    expect(migrationMode(["--apply"])).toBe("apply");
    for (const args of [
      ["--status", "--apply"],
      ["--apply", "--dry-run"],
      ["--force"],
    ])
      expect(() => migrationMode(args)).toThrow();
  });
  it("uses CLI credentials with bounded timeouts and rejects App Service before credential construction", () => {
    expect(migrationConfig()).toMatchObject({
      requestTimeout: 120000,
      pool: { max: 1 },
    });
    expect(mocks.cli).toHaveBeenCalledTimes(1);
    mocks.cli.mockClear();
    expect(() => migrationConfig({ WEBSITE_SITE_NAME: "runtime" })).toThrow(
      /outside App Service/,
    );
    expect(mocks.cli).not.toHaveBeenCalled();
    expect(mocks.managed).not.toHaveBeenCalled();
  });
  it.each([{ args: [] }, { args: ["--status"] }, { args: ["--dry-run"] }])(
    "runs only a history read without the apply option ($args)",
    async ({ args }) => {
      const { pool, batch } = fixture();
      expect(await migrate(args)).toBe(0);
      expect(batch).toHaveBeenCalledExactlyOnceWith(historyQuery);
      expect(pool.close).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining(
          "SQL target: server=example.database.windows.net",
        ),
      );
    },
  );
  it("prints the target before connecting, applies one batch and closes", async () => {
    const { pool, batch } = fixture();
    pool.connect.mockImplementation(async () => {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('database="example-db"; mode=apply'),
      );
    });
    expect(await migrate(["--apply"])).toBe(0);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(pool.close).toHaveBeenCalledTimes(1);
  });
  it("fails closed for unknown options or App Service without opening a pool", async () => {
    fixture();
    expect(await migrate(["--force"])).toBe(1);
    expect(mocks.Pool).not.toHaveBeenCalled();
    vi.stubEnv("WEBSITE_INSTANCE_ID", "runtime");
    expect(await migrate(["--apply"])).toBe(1);
    expect(mocks.Pool).not.toHaveBeenCalled();
  });
  it("reports connection and batch failures without leaking driver data, retries or success logs", async () => {
    const { pool, batch } = fixture();
    batch
      .mockResolvedValueOnce({ recordset: [] })
      .mockRejectedValueOnce(new Error("SECRET SQL AND TOKEN"));
    expect(await migrate(["--apply"])).toBe(1);
    expect(batch).toHaveBeenCalledTimes(2);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain(
      "SECRET",
    );
    expect(vi.mocked(console.log).mock.calls.flat().join(" ")).not.toContain(
      "completed",
    );
    pool.connect.mockRejectedValueOnce(new Error("SECRET"));
    expect(await migrate([])).toBe(1);
    expect(pool.close).toHaveBeenCalledTimes(2);
  });
  it("treats cleanup failure as a failed command", async () => {
    const { pool } = fixture();
    pool.close.mockRejectedValue(new Error("SECRET"));
    expect(await migrate([])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).not.toContain(
      "SECRET",
    );
  });
});
