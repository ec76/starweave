import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sql from "mssql";
import { Connection, Request as TediousRequest, TYPES } from "tedious";
vi.mock("server-only", () => ({}));
import { createThrottle } from "./admin/throttle.ts";
import { withAuthDiagnostics } from "./admin/diagnostics.ts";
import { accountService } from "./admin/service";
import { diagnoseThrottleBinding } from "./admin/throttle-binding.ts";

// Only acquisition and the wire are replaced. Request.input, mssql's RPC type
// mapping, Tedious Request.validateParameters and Connection.callProcedure run.
// No Connection instance, credentials, socket, or SQL server is created.
function offlineTransport(collation: unknown) {
  let validated = 0;
  const connection = Object.assign(new EventEmitter(), {
    databaseCollation: collation,
    config: { options: {} },
    debug: { log: () => {} },
    currentTransactionDescriptor: () => Buffer.alloc(8),
    callProcedure(request: TediousRequest) {
      Connection.prototype.callProcedure.call(
        this as unknown as Connection,
        request,
      );
    },
    makeRequest(request: TediousRequest) {
      validated++;
      const column = { colName: "Allowed", type: TYPES.Bit, flags: 1 };
      (request as EventEmitter).emit("columnMetadata", [column]);
      request.emit("row", [{ metadata: column, value: true }]);
      request.emit("doneInProc", 1, false);
      (request as unknown as { callback: (error: null) => void }).callback(
        null,
      );
    },
  });
  const parent = {
    connected: true,
    config: {},
    acquire(_request: unknown, callback: (...args: unknown[]) => void) {
      callback(null, connection, {});
    },
    release: vi.fn(),
  };
  const requests: sql.Request[] = [];
  const throttle = createThrottle(async () => {
    const request = new sql.Request(parent as unknown as sql.ConnectionPool);
    requests.push(request);
    return request;
  });
  return { throttle, requests, parent, validated: () => validated };
}
let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("AUTH_DEBUG", "1");
  vi.stubEnv("WEBSITE_INSTANCE_ID", "");
  vi.stubEnv("WEBSITE_SITE_NAME", "");
  log = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function bindingEvents() {
  return log.mock.calls
    .map((args: unknown[]) =>
      JSON.parse(String(args[0]).replace("[called-together:auth-debug] ", "")),
    )
    .filter(
      (event: { operation: string }) => event.operation === "throttle_binding",
    );
}
describe("installed throttle RPC validator without SQL", () => {
  it("validates actual send/verify service values through the production binding code", async () => {
    const transport = offlineTransport({ codepage: "CP1252" });
    const service = accountService({
      throttle: transport.throttle,
      session: async () => null,
      list: async () => [],
      manage: async () => {},
    });
    expect(
      await service.mayAttempt(
        "login",
        "fixture@example.invalid",
        "private-fixture-key",
      ),
    ).toBe(true);
    expect(
      await service.mayAttempt(
        "setup-code",
        "fixture@example.invalid",
        "private-fixture-key",
      ),
    ).toBe(true);
    expect(transport.validated()).toBe(4);
    for (const request of transport.requests) {
      const bucket = request.parameters.Bucket!,
        maximum = request.parameters.Maximum!;
      expect(
        bucket.type === sql.VarChar &&
          bucket.length === 80 &&
          typeof bucket.value === "string",
      ).toBe(true);
      expect(
        typeof bucket.value === "string" &&
          /^[\x00-\x7f]+$/.test(bucket.value) &&
          Buffer.byteLength(bucket.value, "utf8") <= 80,
      ).toBe(true);
      expect(
        maximum.type === sql.Int &&
          typeof maximum.value === "number" &&
          Number.isInteger(maximum.value) &&
          maximum.value > 0 &&
          maximum.value <= 2147483647,
      ).toBe(true);
    }
    expect(
      transport.requests.map((request) =>
        typeof request.parameters.Bucket!.value === "string"
          ? request.parameters.Bucket!.value.length
          : -1,
      ),
    ).toEqual([12, 70, 17, 75]);
    expect(
      transport.requests.map((request) => request.parameters.Maximum!.value),
    ).toEqual([60, 5, 20, 3]);
  });
  it("omits unknown parameter names and arbitrary error text and never invokes getters", async () => {
    const getter = vi.fn(() => {
      throw new Error("PRIVATE_SENTINEL");
    });
    await withAuthDiagnostics(async () => {
      diagnoseThrottleBinding(
        {
          code: "EPARAM",
          message:
            "Validation failed for parameter 'PRIVATE_SENTINEL'. Invalid number.",
        },
        {},
      );
      diagnoseThrottleBinding(
        Object.defineProperty({ code: "EPARAM" }, "message", { get: getter }),
        {},
      );
      diagnoseThrottleBinding(
        {
          code: "EPARAM",
          message:
            "Validation failed for parameter 'Maximum'. PRIVATE_SENTINEL",
        },
        { Maximum: { value: "PRIVATE_SENTINEL" } },
      );
    });
    expect(getter).not.toHaveBeenCalled();
    expect(bindingEvents()).toEqual([
      {
        stage: "query",
        operation: "throttle_binding",
        parameter: "Maximum",
        expectedType: "int",
        actualType: "string",
        category: "unclassified",
      },
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_SENTINEL");
  });
  it("uses the same Tedious package resolved by mssql", () => {
    const require = createRequire(import.meta.url);
    expect(require.resolve("tedious")).toBe(
      require.resolve("tedious", { paths: [require.resolve("mssql")] }),
    );
  });
  it.each([
    { bucket: "send:global", maximum: 20 },
    { bucket: "send:" + "a".repeat(64), maximum: 3 },
    { bucket: "verify:global", maximum: 60 },
    { bucket: "verify:" + "b".repeat(64), maximum: 5 },
  ])(
    "validates production-shaped values (case %#) with a supported collation",
    async ({ bucket, maximum }) => {
      const transport = offlineTransport({ codepage: "CP1252" });
      expect(await transport.throttle(bucket, maximum)).toBe(true);
      expect(transport.validated()).toBe(1);
      expect(transport.parent.release).toHaveBeenCalledOnce();
      expect(typeof transport.requests[0]!.parameters.Bucket!.value).toBe(
        "string",
      );
      expect(typeof transport.requests[0]!.parameters.Maximum!.value).toBe(
        "number",
      );
    },
  );
  it.each([
    { collation: undefined, category: "collation_missing" },
    { collation: {}, category: "collation_encoding_missing" },
  ])(
    "reproduces Bucket EPARAM with category=$category",
    async ({ collation, category }) => {
      const transport = offlineTransport(collation);
      await withAuthDiagnostics(async () => {
        await expect(
          transport.throttle("send:global", 20),
        ).rejects.toMatchObject({ code: "EPARAM" });
      });
      expect(transport.validated()).toBe(0);
      expect(transport.parent.release).toHaveBeenCalledOnce();
      expect(bindingEvents()).toEqual([
        {
          stage: "query",
          operation: "throttle_binding",
          parameter: "Bucket",
          expectedType: "varchar(80)",
          actualType: "string",
          category,
        },
      ]);
    },
  );
  it.each([
    {
      bucket: 123,
      maximum: 20,
      parameter: "Bucket",
      actualType: "number",
      category: "invalid_string",
    },
    {
      bucket: "PRIVATE_SENTINEL",
      maximum: "PRIVATE_SENTINEL",
      parameter: "Maximum",
      actualType: "string",
      category: "invalid_number",
    },
    {
      bucket: "PRIVATE_SENTINEL",
      maximum: 2147483648,
      parameter: "Maximum",
      actualType: "number",
      category: "integer_range",
    },
  ])(
    "identifies $parameter/$category without printing values",
    async ({ bucket, maximum, parameter, actualType, category }) => {
      const transport = offlineTransport({ codepage: "CP1252" });
      await withAuthDiagnostics(async () => {
        await expect(
          transport.throttle(bucket as string, maximum as number),
        ).rejects.toMatchObject({ code: "EPARAM" });
      });
      expect(bindingEvents()).toEqual([
        {
          stage: "query",
          operation: "throttle_binding",
          parameter,
          expectedType: parameter === "Bucket" ? "varchar(80)" : "int",
          actualType,
          category,
        },
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE_SENTINEL");
      expect(transport.validated()).toBe(0);
    },
  );
});
