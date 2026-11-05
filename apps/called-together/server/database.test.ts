import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  Pool: vi.fn(),
  managed: vi.fn(),
  cli: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("mssql", () => ({ default: { ConnectionPool: mocks.Pool } }));
vi.mock("@azure/identity", () => ({
  ManagedIdentityCredential: mocks.managed,
  AzureCliCredential: mocks.cli,
}));

import {
  connectionConfig,
  createDatabase,
  database,
  sqlFailureMessage,
} from "./database.js";
import { verifySql, sqlVerificationMode } from "../operators/verify-sql.js";

function poolFixture() {
  const query = vi.fn().mockResolvedValue({ recordset: [{ ok: 1 }] });
  const pool = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    request: vi.fn(() => ({ query })),
  };
  mocks.Pool.mockImplementation(function () {
    return pool;
  });
  return { pool, query };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SQL_SERVER", "example.database.windows.net");
  vi.stubEnv("SQL_DATABASE", "example-db");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  mocks.managed.mockImplementation(function () {
    return { getToken: vi.fn() };
  });
  mocks.cli.mockImplementation(function () {
    return { getToken: vi.fn() };
  });
});
afterEach(async () => {
  await database.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SQL configuration", () => {
  it("requires settings lazily and never reflects their values in errors", async () => {
    const connection = createDatabase();
    expect(mocks.Pool).not.toHaveBeenCalled();
    vi.stubEnv("SQL_SERVER", "https://sensitive-host;token=secret");
    expect(() => connectionConfig()).toThrow(
      "SQL_SERVER and SQL_DATABASE must contain valid SQL settings.",
    );
    await expect(connection.getPool()).rejects.toThrow();
    expect(mocks.Pool).not.toHaveBeenCalled();
    vi.stubEnv("SQL_SERVER", "example.database.windows.net");
    poolFixture();
    await connection.getPool();
    await connection.close();
  });
  it.each([
    {},
    { SQL_SERVER: "example.database.windows.net" },
    { SQL_SERVER: "example.database.windows.net", SQL_DATABASE: "bad\nname" },
  ])("rejects missing or malformed configuration", (env) => {
    expect(() => connectionConfig(env)).toThrow();
  });
  it("uses only system-assigned managed identity in App Service", () => {
    const config = connectionConfig({
      SQL_SERVER: "example.database.windows.net",
      SQL_DATABASE: "example-db",
      WEBSITE_INSTANCE_ID: "instance",
      AZURE_CLIENT_ID: "unrelated-oidc-client",
    });
    expect(mocks.managed).toHaveBeenCalledWith();
    expect(mocks.cli).not.toHaveBeenCalled();
    expect(config.authentication?.type).toBe("token-credential");
    expect(config.authentication?.options).not.toHaveProperty("token");
    expect(config.authentication?.options).toHaveProperty("credential");
  });
  it("uses Azure CLI locally and requires certificate validation with bounded timeouts", () => {
    const config = connectionConfig();
    expect(mocks.cli).toHaveBeenCalledWith({ processTimeoutInMs: 10000 });
    expect(mocks.managed).not.toHaveBeenCalled();
    expect(config.options).toMatchObject({
      encrypt: true,
      trustServerCertificate: false,
    });
    expect(config).toMatchObject({
      connectionTimeout: 15000,
      requestTimeout: 10000,
      pool: { min: 0, max: 3, acquireTimeoutMillis: 20000 },
    });
  });
});

describe("lazy SQL pool", () => {
  it("does not initialize at import or holder creation", () => {
    expect(database).toBeDefined();
    createDatabase();
    expect(mocks.Pool).not.toHaveBeenCalled();
    expect(mocks.managed).not.toHaveBeenCalled();
    expect(mocks.cli).not.toHaveBeenCalled();
  });
  it("shares a pending initialization and reuses its connected pool", async () => {
    const { pool } = poolFixture();
    let release!: () => void;
    pool.connect.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const connection = createDatabase();
    const first = connection.getPool();
    const second = connection.getPool();
    await Promise.resolve();
    expect(pool.connect).toHaveBeenCalledTimes(1);
    release();
    expect(await first).toBe(pool);
    expect(await second).toBe(pool);
    expect(await connection.getPool()).toBe(pool);
    expect(mocks.Pool).toHaveBeenCalledTimes(1);
    await connection.close();
    expect(pool.close).toHaveBeenCalledTimes(1);
  });
  it("closes failed initialization, discards its promise, and retries later", async () => {
    const { pool } = poolFixture();
    pool.connect.mockRejectedValueOnce(new Error("private connection details"));
    const connection = createDatabase();
    await expect(connection.getPool()).rejects.toThrow();
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(await connection.getPool()).toBe(pool);
    expect(mocks.Pool).toHaveBeenCalledTimes(2);
    await connection.close();
  });
  it("invalidates a pool after a background error so a later call can recover", async () => {
    const { pool } = poolFixture();
    const connection = createDatabase();
    await connection.getPool();
    const handler = pool.on.mock.calls[0]?.[1] as () => void;
    handler();
    expect(pool.close).toHaveBeenCalled();
    await connection.getPool();
    expect(mocks.Pool).toHaveBeenCalledTimes(2);
    await connection.close();
  });
});

describe("private operator verification", () => {
  it("runs SELECT 1, closes the pool, and prints only success", async () => {
    const { query, pool } = poolFixture();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await verifySql(createDatabase())).toBe(0);
    expect(query).toHaveBeenCalledWith("SELECT 1 AS ok");
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("SQL verification succeeded: ok=1.");
  });
  it("returns failure and closes connections without logging driver diagnostics", async () => {
    const { pool, query } = poolFixture();
    query.mockRejectedValue({ code: "ELOGIN", message: "SECRET TOKEN CONFIG" });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await verifySql(createDatabase())).toBe(1);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(" ")).not.toContain("SECRET");
    expect(log).toHaveBeenCalledWith(
      "SQL verification failed: check the selected identity and its database access.",
    );
  });
  it("rejects an unexpected result and reports cleanup failure as failure", async () => {
    const { pool, query } = poolFixture();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    query.mockResolvedValue({ recordset: [{ ok: 0 }] });
    expect(await verifySql(createDatabase())).toBe(1);
    query.mockResolvedValue({ recordset: [{ ok: 1 }] });
    pool.close.mockRejectedValue(new Error("SECRET"));
    expect(await verifySql(createDatabase())).toBe(1);
  });
  it("never includes arbitrary error codes or messages in sanitized diagnostics", () => {
    expect(
      sqlFailureMessage({ code: "secret", message: "secret" }),
    ).not.toContain("secret");
  });
});

describe("public article SELECT operator", () => {
  it.each([
    { rows: [] },
    { rows: [{ ArticleId: "DO NOT PRINT ARTICLE CONTENT" }] },
  ])(
    "accepts zero or one view row without logging content",
    async ({ rows }) => {
      const { query, pool } = poolFixture();
      query.mockResolvedValue({ recordset: rows });
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      expect(await verifySql(createDatabase(), "public-articles")).toBe(0);
      expect(query.mock.calls[0]![0]).toContain("SELECT TOP (1)");
      expect(query.mock.calls[0]![0]).toContain("FROM dbo.PublicArticles");
      expect(query.mock.calls[0]![0]).not.toMatch(/SELECT\s+\*/);
      expect(pool.close).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "PublicArticles SELECT verification succeeded (zero rows is valid).",
      );
    },
  );
  it("sanitizes permission errors and closes the pool", async () => {
    const { query, pool } = poolFixture();
    query.mockRejectedValue({
      code: "EREQUEST",
      message: "SELECT DENIED SECRET TOKEN",
    });
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(await verifySql(createDatabase(), "public-articles")).toBe(1);
    expect(pool.close).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain("SECRET");
  });
  it("requires the exact supported option", () => {
    expect(sqlVerificationMode([])).toBe("connection");
    expect(sqlVerificationMode(["--public-articles"])).toBe("public-articles");
    expect(() =>
      sqlVerificationMode(["--public-articles", "--force"]),
    ).toThrow();
    expect(() => sqlVerificationMode(["--unknown"])).toThrow();
  });
});
