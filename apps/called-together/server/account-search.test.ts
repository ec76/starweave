import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sql from "mssql";
import { Request as DriverRequest, TYPES } from "tedious";
vi.mock("server-only", () => ({}));
vi.mock("./database.ts", () => ({ database: { getPool: vi.fn() } }));
import { database } from "./database.ts";
import { searchAccounts, accountCounts } from "./admin/account-search";
import { withAuthDiagnostics } from "./admin/diagnostics";
import type { AdminSession } from "../domain/admin-auth";
const admin = {
  id: "11111111-1111-4111-8111-111111111111",
  roles: ["Administrator"],
} as unknown as AdminSession;
let request: sql.Request;
beforeEach(() => {
  vi.clearAllMocks();
  request = new sql.Request();
  vi.mocked(database.getPool).mockResolvedValue({
    request: () => request,
  } as sql.ConnectionPool);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each(["sql_permission", "role_mapping"])(
  "preserves sanitized search diagnostics for %s without exposing raw SQL or row data",
  async (failure) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DEBUG", "1");
    vi.stubEnv("WEBSITE_SITE_NAME", "");
    vi.stubEnv("WEBSITE_INSTANCE_ID", "");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const query = vi.spyOn(request, "query");
    if (failure === "sql_permission")
      query.mockRejectedValue(
        Object.assign(new Error("PRIVATE_SENTINEL"), {
          code: "EREQUEST",
          number: 229,
        }),
      );
    else
      query.mockResolvedValue({
        recordset: [
          {
            id: "fixture",
            name: "PRIVATE_SENTINEL",
            email: "fixture@example.invalid",
            roles: "PRIVATE_SENTINEL",
          },
        ],
      } as never);
    await expect(
      withAuthDiagnostics(() =>
        searchAccounts(admin, { q: "", role: "", status: "", page: 1 }),
      ),
    ).rejects.toThrow();
    const output = JSON.stringify(log.mock.calls);
    expect(output).not.toContain("PRIVATE_SENTINEL");
    expect(output).not.toContain("fixture@example.invalid");
    expect(output).toContain(
      failure === "sql_permission" ? "sql_permission_denied" : "syntax_error",
    );
  },
);
it.each([null, ["Writer"], ["Approver"], []])(
  "refuses unauthorized search and summaries before acquisition: %j",
  async (roles) => {
    const session = roles ? ({ ...admin, roles } as AdminSession) : null;
    await expect(
      searchAccounts(session, { q: "", status: "", role: "", page: 1 }),
    ).rejects.toThrow();
    await expect(accountCounts(session)).rejects.toThrow();
    expect(database.getPool).not.toHaveBeenCalled();
  },
);
it("bounds, parameterizes and projects actual application search bindings through the installed validator", async () => {
  const needle = "%' OR 1=1;--";
  const query = vi.spyOn(request, "query").mockResolvedValue({
    recordset: Array.from({ length: 26 }, (_, i) => ({
      id: String(i),
      name: "Fixture",
      email: "fixture@example.invalid",
      disabled: false,
      activatedAt: null,
      roles: '[{"Role":"Writer"}]',
      password: "PRIVATE",
    })),
  } as never);
  const result = await searchAccounts(admin, {
    q: needle,
    status: "pending",
    role: "Writer",
    page: 2,
  });
  const text = String(query.mock.calls[0]![0]);
  expect(text).not.toContain(needle);
  expect(text).toContain("OFFSET @Offset ROWS FETCH NEXT @Take");
  expect(text).toContain("ORDER BY u.createdAt DESC,u.id");
  expect(text).toContain("CHARINDEX");
  expect(text).not.toContain("AuthAccounts");
  expect(result.accounts).toHaveLength(25);
  expect(result.hasMore).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
  expect(request.parameters.Offset!.value).toBe(25);
  expect(request.parameters.Take!.value).toBe(26);
  const validator = new DriverRequest("", () => {});
  for (const parameter of Object.values(request.parameters)) {
    const type =
      parameter.type === sql.NVarChar
        ? TYPES.NVarChar
        : parameter.type === sql.VarChar
          ? TYPES.VarChar
          : TYPES.Int;
    validator.addParameter(parameter.name, type, parameter.value, {
      length: parameter.length,
    });
  }
  expect(() =>
    validator.validateParameters({ codepage: "utf8" } as never, {} as never),
  ).not.toThrow();
  expect(request.parameters.Search!.value).toBe(needle);
});
it("rejects service-level out-of-range pagination before SQL and terminates pagination at its ceiling", async () => {
  await expect(
    searchAccounts(admin, { q: "", role: "", status: "", page: 10001 }),
  ).rejects.toThrow();
  expect(database.getPool).not.toHaveBeenCalled();
  vi.spyOn(request, "query").mockResolvedValue({ recordset: [] } as never);
  const result = await searchAccounts(admin, {
    q: "",
    role: "",
    status: "",
    page: 10000,
  });
  expect(result.hasMore).toBe(false);
  expect(request.parameters.Offset!.value).toBe(249975);
});
it("uses aggregate counts without fetching credential data", async () => {
  const query = vi.spyOn(request, "query").mockResolvedValue({
    recordset: [{ active: 7, pending: 2, disabled: 1 }],
  } as never);
  expect(await accountCounts(admin)).toEqual({
    active: 7,
    pending: 2,
    disabled: 1,
  });
  expect(String(query.mock.calls[0]![0])).not.toContain("AuthAccounts");
});
