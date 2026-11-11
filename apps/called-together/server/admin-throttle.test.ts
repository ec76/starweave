import { afterEach, describe, expect, it, vi } from "vitest";
import sql from "mssql";
vi.mock("server-only", () => ({}));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
import { database } from "./database.ts";
import { accounts } from "./admin/repository.ts";
import { withAuthDiagnostics } from "./admin/diagnostics.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("application mssql throttle", () => {
  function prepare(allowed: boolean) {
    const requests: sql.Request[] = [];
    vi.mocked(database.getPool).mockResolvedValue({
      request: () => {
        const request = new sql.Request();
        requests.push(request);
        return request;
      },
    } as sql.ConnectionPool);
    const execute = vi
      .spyOn(sql.Request.prototype, "execute")
      .mockResolvedValue({ recordset: [{ Allowed: allowed }] } as never);
    return { requests, execute };
  }
  it.each([true, false])(
    "reads the procedure bit result %s with real mssql bindings",
    async (allowed) => {
      const { requests, execute } = prepare(allowed);
      expect(await accounts.throttle("verify:" + "a".repeat(64), 5)).toBe(
        allowed,
      );
      expect(execute).toHaveBeenCalledExactlyOnceWith("dbo.AuthThrottle");
      expect(requests[0]!.parameters).toMatchObject({
        Bucket: {
          type: sql.VarChar,
          length: 80,
          value: "verify:" + "a".repeat(64),
          io: 1,
        },
        Maximum: { type: sql.Int, value: 5, io: 1 },
      });
    },
  );
  it("retains a nested SQL exception and logs only safe evidence", async () => {
    const { execute } = prepare(true);
    const error = Object.assign(new Error("PRIVATE_SENTINEL"), {
      cause: {
        code: "EREQUEST",
        originalError: { info: { number: 1205, message: "PRIVATE_SENTINEL" } },
      },
    });
    execute.mockRejectedValue(error);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEBUG", "1");
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    vi.stubEnv("WEBSITE_INSTANCE_ID", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await withAuthDiagnostics(async () => {
      await expect(accounts.throttle("PRIVATE_SENTINEL", 3)).rejects.toBe(
        error,
      );
    });
    const output = JSON.stringify(log.mock.calls);
    expect(output).toContain("sql_deadlock");
    expect(output).toContain("1205");
    expect(output).not.toContain("PRIVATE_SENTINEL");
  });
  it("does not treat a binding exception as a denied attempt", async () => {
    prepare(true);
    const error = new TypeError("PRIVATE_SENTINEL");
    vi.spyOn(sql.Request.prototype, "input").mockImplementation(() => {
      throw error;
    });
    await expect(accounts.throttle("send:global", 20)).rejects.toBe(error);
  });
});
